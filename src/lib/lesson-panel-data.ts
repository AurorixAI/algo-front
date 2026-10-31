/**
 * WB-P3 (F-A10, F-A11, F-A12): what the lesson panel of the teacher (the dashboard and the schedule) knows about the open lesson, and the one way
 * to get it.
 *
 *  - ONE roster rule for both screens: a lesson that has a roster frozen by its start (every started and every past lesson) shows that roster, in
 *    its order, with the students who have since left the group taken from the journal; a lesson that was not started shows the current group
 *    (without the students on a pause today).  Before, the dashboard did the first and the schedule always did the second (F-A12).
 *  - ONE loader with a token (F-A10): every run of the effect takes a token from a request sequence; an answer of an earlier run is dropped
 *    WHOLE - the students, the marks, the status, the version, the error and the `loading` flag.  Closing the panel invalidates the token too.
 *  - The writes of the panel (start, save, finish, cancel) ask the hook for their `target`: the lesson id, its date and the version of the record
 *    of THIS lesson, and only while the journal of this very lesson is the one on the screen.  After an `await` the handler asks `isOpen(key)`
 *    before it touches anything the panel shows.
 *
 * The screens keep their own state of the panel (marks, texts, dialogs): the hook calls them back (`onOpen`, `onLoaded`, `onFailed`, `onClose`).
 */
import { useEffect, useRef, useState } from "react";
import type { AttendanceStatus, GroupAttendance, GroupDetail, LessonAttendanceStatus, StudentInGroup } from "./api";
import type { LessonTeacherInfo } from "./ops-b-types";
import type { SubstitutionRequestMark } from "./substitution-types";
import { createRequestSequence, type RequestSequence } from "./request-sequence";
import { readLessonRoster, rosterFromJournal, rosterSource, withoutPaused, type RosterSource } from "./substitutions";

/** What the panel needs of a lesson of the dashboard / of the schedule. */
export interface PanelLesson {
  id: string;
  groupId?: string | null;
  /** The date of this occurrence; the dashboard's lessons of today may come without it. */
  occurrenceDate?: string | null;
}

export function lessonDateOf(lesson: PanelLesson, businessDate: string): string {
  return lesson.occurrenceDate || businessDate;
}

/** The key of the lesson in the journal (`<date>_<lessonId>`): the same string the server uses for `records`, `versions`, `statuses`. */
export function lessonPanelKey(lesson: PanelLesson, businessDate: string): string {
  return `${lessonDateOf(lesson, businessDate)}_${lesson.id}`;
}

type HistoricalStudent = NonNullable<GroupAttendance["historicalStudents"]>[number];

function historicalMember(student: HistoricalStudent): StudentInGroup {
  return {
    id: student.id,
    first_name: student.first_name || "",
    last_name: student.last_name || "",
    full_name: student.full_name || "Ученик",
    class_level: student.class_level || 0,
    status: "active",
    display_id: student.display_id || null,
    student_phone: null,
    joined_at: null,
    last_theta: null,
    last_level: null,
    last_diagnosed_at: null,
  } satisfies StudentInGroup;
}

/**
 * The roster of a lesson, the one rule of both screens.
 *  - `journal` source (a substitute: the group page is closed to him): the roster that came with the journal;
 *  - the server froze a roster for this lesson (`rosterStudentIds[key]`, even an empty one - it is a fact): exactly those students, in the order
 *    of the frozen list, a student who left the group since is taken from `historicalStudents`;
 *  - nothing frozen yet: the current group; for a lesson of today without the students on a pause (before the start the group list still holds them).
 */
export function buildLessonRoster(input: {
  source: RosterSource;
  lessonKey: string;
  isToday: boolean;
  group: GroupDetail | null | undefined;
  journal: GroupAttendance | null | undefined;
}): StudentInGroup[] {
  const { source, lessonKey, isToday, group, journal } = input;
  if (source === "journal") return rosterFromJournal(journal?.lessonRoster);
  if (!group?.students) return [];
  const frozen = journal?.rosterStudentIds && Object.prototype.hasOwnProperty.call(journal.rosterStudentIds, lessonKey)
    ? journal.rosterStudentIds[lessonKey] || []
    : null;
  if (!frozen) return isToday ? withoutPaused(group.students) : group.students;
  const current = new Map(group.students.map((student) => [student.id, student]));
  const historical = new Map((journal?.historicalStudents || []).map((student) => [student.id, historicalMember(student)]));
  return frozen.flatMap((studentId) => {
    const student = current.get(studentId) || historical.get(studentId);
    return student ? [student] : [];
  });
}

/** Everything the panel shows about ONE lesson, read from one answer of the group page and one answer of the journal. */
export interface LessonPanelSnapshot {
  key: string;
  date: string;
  isToday: boolean;
  source: RosterSource;
  students: StudentInGroup[];
  status: LessonAttendanceStatus;
  /** The version of the record of this lesson (`expectedVersion` of the next write); nothing for a lesson that has no record yet. */
  version: number | undefined;
  /** The marks as the journal holds them: the base of «Оставить мои». */
  baseRecords: Record<string, AttendanceStatus>;
  /** The marks to show: none for a cancelled lesson. */
  marks: Record<string, AttendanceStatus>;
  /** The marks are saved in the journal (a cancelled lesson has none). */
  isSaved: boolean;
  cancellationReason: string | null;
  teacherInfo: LessonTeacherInfo | null;
  requestMark: SubstitutionRequestMark | null;
  savedExcuses: Record<string, { reason: string }>;
}

export function buildLessonSnapshot(input: {
  lesson: PanelLesson;
  businessDate: string;
  source: RosterSource;
  group: GroupDetail | null | undefined;
  journal: GroupAttendance | null | undefined;
}): LessonPanelSnapshot {
  const { lesson, businessDate, source, group, journal } = input;
  const date = lessonDateOf(lesson, businessDate);
  const key = lessonPanelKey(lesson, businessDate);
  const isToday = date === businessDate;
  const status: LessonAttendanceStatus = journal?.statuses?.[key] || "scheduled";
  const baseRecords = journal?.records?.[key] || {};
  const version = journal?.versions?.[key];
  const isSaved = status !== "cancelled" && Object.keys(baseRecords).length > 0;
  return {
    key,
    date,
    isToday,
    source,
    students: buildLessonRoster({ source, lessonKey: key, isToday, group, journal }),
    status,
    version: typeof version === "number" ? version : undefined,
    baseRecords,
    marks: status === "cancelled" ? {} : baseRecords,
    isSaved,
    cancellationReason: journal?.cancellationReasons?.[key] || null,
    teacherInfo: journal?.lessonTeachers?.[key] ?? null,
    requestMark: journal?.substitutionRequests?.[key] ?? null,
    savedExcuses: Object.fromEntries(
      Object.entries(journal?.excuses?.[key] || {}).map(([studentId, info]) => [studentId, { reason: info.reason }]),
    ),
  };
}

export interface LessonPanelOptions<L extends PanelLesson> {
  /** The business date of the centre now: the date of a lesson that carries none, and the «today» of the paused students. */
  businessDate: string;
  /** Owner / administrator read the group page whatever the lesson is (see `rosterSource`); false on the teacher's screens. */
  isManager?: boolean;
  /** The ids of the groups the viewer teaches: a lesson of another group is a substitution and its roster comes with the journal. */
  ownGroupIds: readonly string[];
  getGroup: (groupId: string) => Promise<GroupDetail>;
  getJournal: (groupId: string, date: string) => Promise<GroupAttendance>;
  /** The part of a write that carries the version of the record (`useLessonMarksOps().versionBody`). */
  versionBody: () => { expectedVersion?: number };
  /** A lesson was opened: forget what the panel showed about the previous one (everything not yet known is empty). */
  onOpen: (lesson: L, context: { key: string; source: RosterSource }) => void;
  /** The journal of THE OPEN lesson arrived: put it on the screen. Never called for an answer of another lesson. */
  onLoaded: (snapshot: LessonPanelSnapshot, lesson: L) => void;
  /** The journal of THE OPEN lesson could not be read. */
  onFailed: (error: unknown) => void;
  /** No lesson is open (or it has no group): the panel is empty. */
  onClose: () => void;
}

/** What a write of the panel sends: this lesson, its date, the version of ITS record. */
export interface LessonPanelTarget {
  key: string;
  groupId: string;
  lessonId: string;
  lessonDate: string;
  versionBody: { expectedVersion?: number };
}

export interface LessonPanelData<L extends PanelLesson> {
  /** The journal of the open lesson is being read (also: a lesson was just opened and the effect has not started yet). */
  loading: boolean;
  /** The target of a write for `lesson`, or null while the panel does not hold the journal of exactly this lesson. */
  target: (lesson: L) => LessonPanelTarget | null;
  /** Is the lesson with this key the one open now? Asked by a handler after its `await`. */
  isOpen: (key: string) => boolean;
}

type Phase = { key: string | null; status: "loading" | "loaded" | "failed" };

export function useLessonPanelData<L extends PanelLesson>(lesson: L | null, options: LessonPanelOptions<L>): LessonPanelData<L> {
  const optionsRef = useRef(options);
  optionsRef.current = options;
  const sequenceRef = useRef<RequestSequence | null>(null);
  if (!sequenceRef.current) sequenceRef.current = createRequestSequence();
  const openKey = useRef<string | null>(null);
  const loadedKey = useRef<string | null>(null);
  const [phase, setPhase] = useState<Phase>({ key: null, status: "loaded" });

  const currentKey = lesson && lesson.groupId ? lessonPanelKey(lesson, options.businessDate) : null;
  const loading = currentKey !== null && !(phase.key === currentKey && phase.status !== "loading");

  useEffect(() => {
    const sequence = sequenceRef.current!;
    const token = sequence.next();
    const opts = optionsRef.current;
    openKey.current = null;
    loadedKey.current = null;
    if (!lesson || !lesson.groupId) {
      setPhase({ key: null, status: "loaded" });
      opts.onClose();
      return () => { sequence.next(); };
    }
    const groupId = lesson.groupId;
    const key = lessonPanelKey(lesson, opts.businessDate);
    const date = lessonDateOf(lesson, opts.businessDate);
    const source = rosterSource({ isManager: opts.isManager ?? false, groupId, ownGroupIds: opts.ownGroupIds });
    openKey.current = key;
    setPhase({ key, status: "loading" });
    opts.onOpen(lesson, { key, source });
    readLessonRoster({
      source,
      groupId,
      getGroup: (id) => opts.getGroup(id),
      getJournal: () => opts.getJournal(groupId, date),
    })
      .then(([group, journal]) => {
        if (!sequence.isCurrent(token)) return;
        const latest = optionsRef.current;
        latest.onLoaded(buildLessonSnapshot({ lesson, businessDate: latest.businessDate, source, group, journal }), lesson);
        loadedKey.current = key;
        setPhase({ key, status: "loaded" });
      })
      .catch((error) => {
        if (!sequence.isCurrent(token)) return;
        loadedKey.current = null;
        setPhase({ key, status: "failed" });
        optionsRef.current.onFailed(error);
      });
    return () => { sequence.next(); };
  }, [lesson, options.businessDate]);

  return {
    loading,
    target: (forLesson) => {
      if (!forLesson.groupId) return null;
      const key = lessonPanelKey(forLesson, optionsRef.current.businessDate);
      if (loadedKey.current !== key || openKey.current !== key) return null;
      return {
        key,
        groupId: forLesson.groupId,
        lessonId: forLesson.id,
        lessonDate: lessonDateOf(forLesson, optionsRef.current.businessDate),
        versionBody: optionsRef.current.versionBody(),
      };
    },
    isOpen: (key) => openKey.current === key,
  };
}

/** A write of the panel was asked before the journal of this lesson was on the screen (or after another lesson was opened). */
export const LESSON_NOT_LOADED_TEXT = "Журнал этого урока ещё не загружен. Закройте окно и откройте урок снова.";
