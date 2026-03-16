"use client";

import { createContext, useContext, useState, ReactNode } from "react";

type Language = "ru" | "uz" | "en";

interface Translations {
  [key: string]: {
    ru: string;
    uz: string;
    en: string;
  };
}

const translations: Translations = {
  // Common
  "common.back": { ru: "Назад", uz: "Ortga", en: "Back" },
  "common.next": { ru: "Далее", uz: "Keyingi", en: "Next" },
  "common.save": { ru: "Сохранить", uz: "Saqlash", en: "Save" },
  "common.cancel": { ru: "Отмена", uz: "Bekor", en: "Cancel" },
  "common.delete": { ru: "Удалить", uz: "O'chirish", en: "Delete" },
  "common.edit": { ru: "Редактировать", uz: "Tahrirlash", en: "Edit" },
  "common.search": { ru: "Поиск", uz: "Qidirish", en: "Search" },
  "common.loading": { ru: "Загрузка...", uz: "Yuklanmoqda...", en: "Loading..." },
  
  // Auth
  "auth.login": { ru: "Войти", uz: "Kirish", en: "Login" },
  "auth.register": { ru: "Регистрация", uz: "Ro'yxatdan o'tish", en: "Register" },
  "auth.email": { ru: "Email", uz: "Email", en: "Email" },
  "auth.password": { ru: "Пароль", uz: "Parol", en: "Password" },
  "auth.forgot_password": { ru: "Забыли пароль?", uz: "Parolni unutdingizmi?", en: "Forgot password?" },
  "auth.no_account": { ru: "Нет аккаунта?", uz: "Akkauntingiz yo'qmi?", en: "No account?" },
  "auth.have_account": { ru: "Уже есть аккаунт?", uz: "Akkauntingiz bormi?", en: "Already have an account?" },
  
  // Dashboard
  "dashboard.title": { ru: "Панель управления", uz: "Boshqaruv paneli", en: "Dashboard" },
  "dashboard.students": { ru: "Ученики", uz: "O'quvchilar", en: "Students" },
  "dashboard.exams": { ru: "Экзамены", uz: "Imtihonlar", en: "Exams" },
  "dashboard.analytics": { ru: "Аналитика", uz: "Tahlillar", en: "Analytics" },
  "dashboard.settings": { ru: "Настройки", uz: "Sozlamalar", en: "Settings" },
  
  // Students
  "students.new": { ru: "Новый ученик", uz: "Yangi o'quvchi", en: "New student" },
  "students.name": { ru: "Имя и фамилия", uz: "Ism va familiya", en: "Full name" },
  "students.phone": { ru: "Телефон", uz: "Telefon", en: "Phone" },
  "students.grade": { ru: "Класс", uz: "Sinf", en: "Grade" },
  "students.level": { ru: "Уровень", uz: "Daraja", en: "Level" },
  "students.status.pending": { ru: "Ожидает", uz: "Kutmoqda", en: "Pending" },
  "students.status.in_progress": { ru: "В процессе", uz: "Jarayonda", en: "In progress" },
  "students.status.completed": { ru: "Завершено", uz: "Tugallandi", en: "Completed" },
  
  // Diagnostic
  "diagnostic.title": { ru: "Диагностика", uz: "Diagnostika", en: "Diagnostic" },
  "diagnostic.start": { ru: "Начать диагностику", uz: "Diagnostikani boshlash", en: "Start diagnostic" },
  "diagnostic.question": { ru: "Вопрос", uz: "Savol", en: "Question" },
  "diagnostic.next_question": { ru: "Следующий вопрос", uz: "Keyingi savol", en: "Next question" },
  "diagnostic.finish": { ru: "Завершить", uz: "Tugatish", en: "Finish" },
  "diagnostic.analyzing": { ru: "Анализируем результаты...", uz: "Natijalar tahlil qilinmoqda...", en: "Analyzing results..." },
  "diagnostic.your_level": { ru: "Твой уровень", uz: "Sizning darajangiz", en: "Your level" },
  
  // Exams
  "exams.new": { ru: "Новый экзамен", uz: "Yangi imtihon", en: "New exam" },
  "exams.name": { ru: "Название экзамена", uz: "Imtihon nomi", en: "Exam name" },
  "exams.duration": { ru: "Время выполнения", uz: "Bajarish vaqti", en: "Duration" },
  "exams.questions_count": { ru: "Количество вопросов", uz: "Savollar soni", en: "Questions count" },
  "exams.topics": { ru: "Темы", uz: "Mavzular", en: "Topics" },
  
  // Levels
  "level.A": { ru: "Отлично", uz: "A'lo", en: "Excellent" },
  "level.B": { ru: "Хорошо", uz: "Yaxshi", en: "Good" },
  "level.C": { ru: "Средне", uz: "O'rtacha", en: "Average" },
  "level.D": { ru: "Нужна работа", uz: "Ish kerak", en: "Needs work" },
  
  // Organization types
  "org.school": { ru: "Школа", uz: "Maktab", en: "School" },
  "org.center": { ru: "Учебный центр", uz: "O'quv markazi", en: "Learning center" },
  "org.university": { ru: "Университет", uz: "Universitet", en: "University" },
  "org.tutor": { ru: "Частный репетитор", uz: "Xususiy repetitor", en: "Private tutor" },
};

interface LanguageContextType {
  language: Language;
  setLanguage: (lang: Language) => void;
  t: (key: string) => string;
}

const LanguageContext = createContext<LanguageContextType | undefined>(undefined);

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [language, setLanguage] = useState<Language>("ru");

  const t = (key: string): string => {
    if (translations[key]) {
      return translations[key][language];
    }
    console.warn(`Translation missing for key: ${key}`);
    return key;
  };

  return (
    <LanguageContext.Provider value={{ language, setLanguage, t }}>
      {children}
    </LanguageContext.Provider>
  );
}

export function useLanguage() {
  const context = useContext(LanguageContext);
  if (context === undefined) {
    throw new Error("useLanguage must be used within a LanguageProvider");
  }
  return context;
}

export { translations };
export type { Language };
