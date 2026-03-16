// Дерево тем математики с подтемами

export interface Topic {
  id: string;
  name: string;
  nameUz: string;
  nameEn: string;
  children?: Topic[];
}

export interface Subject {
  id: string;
  name: string;
  nameUz: string;
  nameEn: string;
  icon: string;
  topics: Topic[];
}

export const mathCurriculum: Subject[] = [
  {
    id: "algebra",
    name: "Алгебра",
    nameUz: "Algebra",
    nameEn: "Algebra",
    icon: "𝑥",
    topics: [
      {
        id: "numbers",
        name: "Числа и вычисления",
        nameUz: "Sonlar va hisoblashlar",
        nameEn: "Numbers and Calculations",
        children: [
          {
            id: "natural_numbers",
            name: "Натуральные числа",
            nameUz: "Natural sonlar",
            nameEn: "Natural Numbers",
            children: [
              { id: "divisibility", name: "Делимость", nameUz: "Bo'linish", nameEn: "Divisibility" },
              { id: "gcd_lcm", name: "НОД и НОК", nameUz: "EKUB va EKUK", nameEn: "GCD and LCM" },
              { id: "prime_numbers", name: "Простые числа", nameUz: "Tub sonlar", nameEn: "Prime Numbers" },
            ],
          },
          {
            id: "fractions",
            name: "Дроби",
            nameUz: "Kasrlar",
            nameEn: "Fractions",
            children: [
              { id: "common_fractions", name: "Обыкновенные дроби", nameUz: "Oddiy kasrlar", nameEn: "Common Fractions" },
              { id: "decimal_fractions", name: "Десятичные дроби", nameUz: "O'nlik kasrlar", nameEn: "Decimal Fractions" },
              { id: "fraction_operations", name: "Действия с дробями", nameUz: "Kasrlar ustida amallar", nameEn: "Fraction Operations" },
              { id: "mixed_numbers", name: "Смешанные числа", nameUz: "Aralash sonlar", nameEn: "Mixed Numbers" },
            ],
          },
          {
            id: "negative_numbers",
            name: "Отрицательные числа",
            nameUz: "Manfiy sonlar",
            nameEn: "Negative Numbers",
            children: [
              { id: "negative_intro", name: "Понятие отрицательного числа", nameUz: "Manfiy son tushunchasi", nameEn: "Concept of Negative Numbers" },
              { id: "negative_operations", name: "Действия с отрицательными", nameUz: "Manfiy sonlar bilan amallar", nameEn: "Operations with Negatives" },
            ],
          },
          {
            id: "percents",
            name: "Проценты",
            nameUz: "Foizlar",
            nameEn: "Percentages",
            children: [
              { id: "percent_basics", name: "Понятие процента", nameUz: "Foiz tushunchasi", nameEn: "Percent Basics" },
              { id: "percent_problems", name: "Задачи на проценты", nameUz: "Foizlarga doir masalalar", nameEn: "Percent Problems" },
            ],
          },
        ],
      },
      {
        id: "expressions",
        name: "Выражения и преобразования",
        nameUz: "Ifodalar va almashtirishlar",
        nameEn: "Expressions and Transformations",
        children: [
          {
            id: "algebraic_expressions",
            name: "Алгебраические выражения",
            nameUz: "Algebraik ifodalar",
            nameEn: "Algebraic Expressions",
            children: [
              { id: "monomials", name: "Одночлены", nameUz: "Bir hadlar", nameEn: "Monomials" },
              { id: "polynomials", name: "Многочлены", nameUz: "Ko'p hadlar", nameEn: "Polynomials" },
              { id: "factoring", name: "Разложение на множители", nameUz: "Ko'paytuvchilarga ajratish", nameEn: "Factoring" },
            ],
          },
          {
            id: "formulas",
            name: "Формулы сокращённого умножения",
            nameUz: "Qisqa ko'paytirish formulalari",
            nameEn: "Special Product Formulas",
            children: [
              { id: "square_sum", name: "Квадрат суммы/разности", nameUz: "Yig'indi/ayirma kvadrati", nameEn: "Square of Sum/Difference" },
              { id: "diff_squares", name: "Разность квадратов", nameUz: "Kvadratlar ayirmasi", nameEn: "Difference of Squares" },
              { id: "cube_formulas", name: "Кубы суммы и разности", nameUz: "Yig'indi va ayirma kublari", nameEn: "Cube Formulas" },
            ],
          },
          {
            id: "rational_expressions",
            name: "Рациональные выражения",
            nameUz: "Ratsional ifodalar",
            nameEn: "Rational Expressions",
            children: [
              { id: "algebraic_fractions", name: "Алгебраические дроби", nameUz: "Algebraik kasrlar", nameEn: "Algebraic Fractions" },
              { id: "fraction_simplify", name: "Сокращение дробей", nameUz: "Kasrlarni qisqartirish", nameEn: "Simplifying Fractions" },
            ],
          },
        ],
      },
      {
        id: "equations",
        name: "Уравнения",
        nameUz: "Tenglamalar",
        nameEn: "Equations",
        children: [
          {
            id: "linear_equations",
            name: "Линейные уравнения",
            nameUz: "Chiziqli tenglamalar",
            nameEn: "Linear Equations",
            children: [
              { id: "linear_simple", name: "Простые линейные", nameUz: "Oddiy chiziqli", nameEn: "Simple Linear" },
              { id: "linear_brackets", name: "Уравнения со скобками", nameUz: "Qavsli tenglamalar", nameEn: "Equations with Brackets" },
              { id: "linear_fractions", name: "Уравнения с дробями", nameUz: "Kasrli tenglamalar", nameEn: "Equations with Fractions" },
            ],
          },
          {
            id: "quadratic_equations",
            name: "Квадратные уравнения",
            nameUz: "Kvadrat tenglamalar",
            nameEn: "Quadratic Equations",
            children: [
              { id: "incomplete_quadratic", name: "Неполные квадратные", nameUz: "To'liqsiz kvadrat", nameEn: "Incomplete Quadratic" },
              { id: "discriminant", name: "Через дискриминант", nameUz: "Diskriminant orqali", nameEn: "Using Discriminant" },
              { id: "vieta", name: "Теорема Виета", nameUz: "Viyet teoremasi", nameEn: "Vieta's Theorem" },
              { id: "biquadratic", name: "Биквадратные", nameUz: "Bikvadrat", nameEn: "Biquadratic" },
            ],
          },
          {
            id: "systems",
            name: "Системы уравнений",
            nameUz: "Tenglamalar sistemasi",
            nameEn: "Systems of Equations",
            children: [
              { id: "substitution", name: "Метод подстановки", nameUz: "Almashtirish usuli", nameEn: "Substitution Method" },
              { id: "elimination", name: "Метод сложения", nameUz: "Qo'shish usuli", nameEn: "Elimination Method" },
              { id: "graphical", name: "Графический метод", nameUz: "Grafik usul", nameEn: "Graphical Method" },
            ],
          },
          {
            id: "irrational_equations",
            name: "Иррациональные уравнения",
            nameUz: "Irratsional tenglamalar",
            nameEn: "Irrational Equations",
          },
        ],
      },
      {
        id: "inequalities",
        name: "Неравенства",
        nameUz: "Tengsizliklar",
        nameEn: "Inequalities",
        children: [
          {
            id: "linear_inequalities",
            name: "Линейные неравенства",
            nameUz: "Chiziqli tengsizliklar",
            nameEn: "Linear Inequalities",
          },
          {
            id: "quadratic_inequalities",
            name: "Квадратные неравенства",
            nameUz: "Kvadrat tengsizliklar",
            nameEn: "Quadratic Inequalities",
          },
          {
            id: "systems_inequalities",
            name: "Системы неравенств",
            nameUz: "Tengsizliklar sistemasi",
            nameEn: "Systems of Inequalities",
          },
        ],
      },
      {
        id: "functions",
        name: "Функции",
        nameUz: "Funksiyalar",
        nameEn: "Functions",
        children: [
          {
            id: "function_basics",
            name: "Понятие функции",
            nameUz: "Funksiya tushunchasi",
            nameEn: "Function Basics",
            children: [
              { id: "domain_range", name: "Область определения", nameUz: "Aniqlanish sohasi", nameEn: "Domain and Range" },
              { id: "function_graph", name: "График функции", nameUz: "Funksiya grafigi", nameEn: "Function Graph" },
            ],
          },
          {
            id: "linear_function",
            name: "Линейная функция",
            nameUz: "Chiziqli funksiya",
            nameEn: "Linear Function",
          },
          {
            id: "quadratic_function",
            name: "Квадратичная функция",
            nameUz: "Kvadrat funksiya",
            nameEn: "Quadratic Function",
            children: [
              { id: "parabola", name: "Парабола", nameUz: "Parabola", nameEn: "Parabola" },
              { id: "vertex", name: "Вершина параболы", nameUz: "Parabola uchi", nameEn: "Vertex" },
            ],
          },
          {
            id: "power_function",
            name: "Степенная функция",
            nameUz: "Darajali funksiya",
            nameEn: "Power Function",
          },
        ],
      },
      {
        id: "progressions",
        name: "Прогрессии",
        nameUz: "Progressiyalar",
        nameEn: "Progressions",
        children: [
          {
            id: "arithmetic_progression",
            name: "Арифметическая прогрессия",
            nameUz: "Arifmetik progressiya",
            nameEn: "Arithmetic Progression",
          },
          {
            id: "geometric_progression",
            name: "Геометрическая прогрессия",
            nameUz: "Geometrik progressiya",
            nameEn: "Geometric Progression",
          },
        ],
      },
    ],
  },
  {
    id: "geometry",
    name: "Геометрия",
    nameUz: "Geometriya",
    nameEn: "Geometry",
    icon: "△",
    topics: [
      {
        id: "planimetry",
        name: "Планиметрия",
        nameUz: "Planimetriya",
        nameEn: "Planimetry",
        children: [
          {
            id: "triangles",
            name: "Треугольники",
            nameUz: "Uchburchaklar",
            nameEn: "Triangles",
            children: [
              { id: "triangle_types", name: "Виды треугольников", nameUz: "Uchburchak turlari", nameEn: "Types of Triangles" },
              { id: "triangle_properties", name: "Свойства треугольников", nameUz: "Uchburchak xossalari", nameEn: "Triangle Properties" },
              { id: "congruence", name: "Признаки равенства", nameUz: "Tenglik belgilari", nameEn: "Congruence Criteria" },
              { id: "similarity", name: "Подобие треугольников", nameUz: "O'xshash uchburchaklar", nameEn: "Similar Triangles" },
              { id: "pythagorean", name: "Теорема Пифагора", nameUz: "Pifagor teoremasi", nameEn: "Pythagorean Theorem" },
            ],
          },
          {
            id: "quadrilaterals",
            name: "Четырёхугольники",
            nameUz: "To'rtburchaklar",
            nameEn: "Quadrilaterals",
            children: [
              { id: "parallelogram", name: "Параллелограмм", nameUz: "Parallelogramm", nameEn: "Parallelogram" },
              { id: "rectangle", name: "Прямоугольник", nameUz: "To'g'ri to'rtburchak", nameEn: "Rectangle" },
              { id: "rhombus", name: "Ромб", nameUz: "Romb", nameEn: "Rhombus" },
              { id: "square", name: "Квадрат", nameUz: "Kvadrat", nameEn: "Square" },
              { id: "trapezoid", name: "Трапеция", nameUz: "Trapetsiya", nameEn: "Trapezoid" },
            ],
          },
          {
            id: "circles",
            name: "Окружность и круг",
            nameUz: "Aylana va doira",
            nameEn: "Circles",
            children: [
              { id: "circle_elements", name: "Элементы окружности", nameUz: "Aylana elementlari", nameEn: "Circle Elements" },
              { id: "inscribed_angles", name: "Вписанные углы", nameUz: "Ichki burchaklar", nameEn: "Inscribed Angles" },
              { id: "tangent", name: "Касательная", nameUz: "Urinma", nameEn: "Tangent" },
              { id: "inscribed_circumscribed", name: "Вписанные и описанные", nameUz: "Ichki va tashqi", nameEn: "Inscribed and Circumscribed" },
            ],
          },
          {
            id: "areas",
            name: "Площади фигур",
            nameUz: "Figuralar yuzi",
            nameEn: "Areas",
            children: [
              { id: "triangle_area", name: "Площадь треугольника", nameUz: "Uchburchak yuzi", nameEn: "Triangle Area" },
              { id: "quadrilateral_area", name: "Площадь четырёхугольника", nameUz: "To'rtburchak yuzi", nameEn: "Quadrilateral Area" },
              { id: "circle_area", name: "Площадь круга", nameUz: "Doira yuzi", nameEn: "Circle Area" },
            ],
          },
        ],
      },
      {
        id: "stereometry",
        name: "Стереометрия",
        nameUz: "Stereometriya",
        nameEn: "Stereometry",
        children: [
          {
            id: "prisms",
            name: "Призмы",
            nameUz: "Prizmalar",
            nameEn: "Prisms",
          },
          {
            id: "pyramids",
            name: "Пирамиды",
            nameUz: "Piramidalar",
            nameEn: "Pyramids",
          },
          {
            id: "cylinders_cones",
            name: "Цилиндры и конусы",
            nameUz: "Silindrlar va konuslar",
            nameEn: "Cylinders and Cones",
          },
          {
            id: "spheres",
            name: "Сфера и шар",
            nameUz: "Sfera va shar",
            nameEn: "Sphere",
          },
        ],
      },
      {
        id: "vectors",
        name: "Векторы",
        nameUz: "Vektorlar",
        nameEn: "Vectors",
        children: [
          { id: "vector_basics", name: "Понятие вектора", nameUz: "Vektor tushunchasi", nameEn: "Vector Basics" },
          { id: "vector_operations", name: "Действия с векторами", nameUz: "Vektorlar ustida amallar", nameEn: "Vector Operations" },
          { id: "scalar_product", name: "Скалярное произведение", nameUz: "Skalyar ko'paytma", nameEn: "Scalar Product" },
        ],
      },
      {
        id: "coordinates",
        name: "Координаты",
        nameUz: "Koordinatalar",
        nameEn: "Coordinates",
        children: [
          { id: "coordinate_plane", name: "Координатная плоскость", nameUz: "Koordinata tekisligi", nameEn: "Coordinate Plane" },
          { id: "distance_formula", name: "Формула расстояния", nameUz: "Masofa formulasi", nameEn: "Distance Formula" },
          { id: "midpoint", name: "Середина отрезка", nameUz: "Kesma o'rtasi", nameEn: "Midpoint" },
        ],
      },
    ],
  },
];

// Учебники
export interface Textbook {
  id: string;
  name: string;
  author: string;
  grade: number;
  subject: "algebra" | "geometry" | "math";
  chapters: Chapter[];
}

export interface Chapter {
  id: string;
  number: number;
  name: string;
  sections: Section[];
}

export interface Section {
  id: string;
  number: string;
  name: string;
  topicIds: string[];
}

export const textbooks: Textbook[] = [
  {
    id: "alimov_7",
    name: "Алгебра 7",
    author: "Ш.А. Алимов",
    grade: 7,
    subject: "algebra",
    chapters: [
      {
        id: "alimov_7_ch1",
        number: 1,
        name: "Алгебраические выражения",
        sections: [
          { id: "alimov_7_1_1", number: "1.1", name: "Числовые выражения", topicIds: ["natural_numbers"] },
          { id: "alimov_7_1_2", number: "1.2", name: "Алгебраические выражения", topicIds: ["algebraic_expressions"] },
          { id: "alimov_7_1_3", number: "1.3", name: "Одночлены", topicIds: ["monomials"] },
          { id: "alimov_7_1_4", number: "1.4", name: "Многочлены", topicIds: ["polynomials"] },
        ],
      },
      {
        id: "alimov_7_ch2",
        number: 2,
        name: "Уравнения с одной переменной",
        sections: [
          { id: "alimov_7_2_1", number: "2.1", name: "Уравнение и его корни", topicIds: ["linear_equations"] },
          { id: "alimov_7_2_2", number: "2.2", name: "Линейное уравнение", topicIds: ["linear_simple"] },
          { id: "alimov_7_2_3", number: "2.3", name: "Решение задач с помощью уравнений", topicIds: ["linear_equations"] },
        ],
      },
      {
        id: "alimov_7_ch3",
        number: 3,
        name: "Формулы сокращённого умножения",
        sections: [
          { id: "alimov_7_3_1", number: "3.1", name: "Квадрат суммы и разности", topicIds: ["square_sum"] },
          { id: "alimov_7_3_2", number: "3.2", name: "Разность квадратов", topicIds: ["diff_squares"] },
          { id: "alimov_7_3_3", number: "3.3", name: "Разложение на множители", topicIds: ["factoring"] },
        ],
      },
    ],
  },
  {
    id: "alimov_8",
    name: "Алгебра 8",
    author: "Ш.А. Алимов",
    grade: 8,
    subject: "algebra",
    chapters: [
      {
        id: "alimov_8_ch1",
        number: 1,
        name: "Рациональные дроби",
        sections: [
          { id: "alimov_8_1_1", number: "1.1", name: "Рациональные выражения", topicIds: ["rational_expressions"] },
          { id: "alimov_8_1_2", number: "1.2", name: "Основное свойство дроби", topicIds: ["algebraic_fractions"] },
          { id: "alimov_8_1_3", number: "1.3", name: "Сложение и вычитание дробей", topicIds: ["fraction_simplify"] },
        ],
      },
      {
        id: "alimov_8_ch2",
        number: 2,
        name: "Квадратные уравнения",
        sections: [
          { id: "alimov_8_2_1", number: "2.1", name: "Неполные квадратные уравнения", topicIds: ["incomplete_quadratic"] },
          { id: "alimov_8_2_2", number: "2.2", name: "Формула корней", topicIds: ["discriminant"] },
          { id: "alimov_8_2_3", number: "2.3", name: "Теорема Виета", topicIds: ["vieta"] },
          { id: "alimov_8_2_4", number: "2.4", name: "Биквадратные уравнения", topicIds: ["biquadratic"] },
        ],
      },
    ],
  },
  {
    id: "merzlyak_7",
    name: "Алгебра 7",
    author: "А.Г. Мерзляк",
    grade: 7,
    subject: "algebra",
    chapters: [
      {
        id: "merzlyak_7_ch1",
        number: 1,
        name: "Линейное уравнение с одной переменной",
        sections: [
          { id: "merzlyak_7_1_1", number: "1", name: "Введение в алгебру", topicIds: ["algebraic_expressions"] },
          { id: "merzlyak_7_1_2", number: "2", name: "Линейное уравнение", topicIds: ["linear_simple", "linear_brackets"] },
          { id: "merzlyak_7_1_3", number: "3", name: "Решение задач", topicIds: ["linear_equations"] },
        ],
      },
      {
        id: "merzlyak_7_ch2",
        number: 2,
        name: "Целые выражения",
        sections: [
          { id: "merzlyak_7_2_1", number: "4", name: "Степень с натуральным показателем", topicIds: ["monomials"] },
          { id: "merzlyak_7_2_2", number: "5", name: "Одночлены", topicIds: ["monomials"] },
          { id: "merzlyak_7_2_3", number: "6", name: "Многочлены", topicIds: ["polynomials"] },
        ],
      },
    ],
  },
  {
    id: "atanasyan_7_9",
    name: "Геометрия 7-9",
    author: "Л.С. Атанасян",
    grade: 7,
    subject: "geometry",
    chapters: [
      {
        id: "atanasyan_ch1",
        number: 1,
        name: "Начальные геометрические сведения",
        sections: [
          { id: "atanasyan_1_1", number: "1", name: "Точки, прямые, отрезки", topicIds: ["coordinate_plane"] },
          { id: "atanasyan_1_2", number: "2", name: "Луч и угол", topicIds: ["coordinate_plane"] },
          { id: "atanasyan_1_3", number: "3", name: "Сравнение отрезков и углов", topicIds: ["coordinate_plane"] },
        ],
      },
      {
        id: "atanasyan_ch2",
        number: 2,
        name: "Треугольники",
        sections: [
          { id: "atanasyan_2_1", number: "1", name: "Первый признак равенства треугольников", topicIds: ["congruence"] },
          { id: "atanasyan_2_2", number: "2", name: "Медианы, биссектрисы и высоты", topicIds: ["triangle_properties"] },
          { id: "atanasyan_2_3", number: "3", name: "Второй и третий признаки равенства", topicIds: ["congruence"] },
          { id: "atanasyan_2_4", number: "4", name: "Задачи на построение", topicIds: ["triangles"] },
        ],
      },
      {
        id: "atanasyan_ch3",
        number: 3,
        name: "Параллельные прямые",
        sections: [
          { id: "atanasyan_3_1", number: "1", name: "Признаки параллельности", topicIds: ["coordinate_plane"] },
          { id: "atanasyan_3_2", number: "2", name: "Аксиома параллельных прямых", topicIds: ["coordinate_plane"] },
        ],
      },
      {
        id: "atanasyan_ch4",
        number: 4,
        name: "Соотношения между сторонами и углами",
        sections: [
          { id: "atanasyan_4_1", number: "1", name: "Сумма углов треугольника", topicIds: ["triangle_properties"] },
          { id: "atanasyan_4_2", number: "2", name: "Соотношения между сторонами и углами", topicIds: ["triangle_properties"] },
          { id: "atanasyan_4_3", number: "3", name: "Прямоугольные треугольники", topicIds: ["pythagorean"] },
        ],
      },
    ],
  },
];

// Получить все темы плоским списком
export function flattenTopics(topics: Topic[], parentPath: string[] = []): { id: string; path: string[]; name: string }[] {
  const result: { id: string; path: string[]; name: string }[] = [];
  
  for (const topic of topics) {
    const currentPath = [...parentPath, topic.name];
    result.push({ id: topic.id, path: currentPath, name: topic.name });
    
    if (topic.children) {
      result.push(...flattenTopics(topic.children, currentPath));
    }
  }
  
  return result;
}

// Получить классы
export function getGrades(): number[] {
  return [5, 6, 7, 8, 9, 10, 11];
}

// Получить учебники по классу и предмету
export function getTextbooksByGrade(grade: number, subject?: string): Textbook[] {
  return textbooks.filter(t => t.grade === grade && (!subject || t.subject === subject));
}

// Получить все ID подтем рекурсивно
export function getAllTopicIds(topic: Topic): string[] {
  const ids: string[] = [topic.id];
  if (topic.children) {
    for (const child of topic.children) {
      ids.push(...getAllTopicIds(child));
    }
  }
  return ids;
}
