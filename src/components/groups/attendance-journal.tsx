"use client";

// Compatibility export for old imports. The journal has one implementation so
// its period, status and save semantics cannot drift between role pages.
import { GroupAttendanceJournal } from "./group-attendance-journal";

export const AttendanceJournal = GroupAttendanceJournal;
