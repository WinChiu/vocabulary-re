import { initialStats } from './core.js';
const words = [
  [
    'serendipity',
    '意外發現美好事物的運氣',
    'Little moments',
    'Finding this book was pure serendipity.',
  ],
  [
    'resilient',
    '有韌性的；能恢復的',
    'Personal growth',
    'She remained resilient through every challenge.',
  ],
  [
    'wander',
    '漫步；閒逛',
    'Everyday life',
    'We wander through the quiet streets.',
  ],
  [
    'ephemeral',
    '短暫的；轉瞬即逝的',
    'Little moments',
    'The beauty of cherry blossoms is ephemeral.',
  ],
  [
    'embrace',
    '擁抱；欣然接受',
    'Personal growth',
    'Learn to embrace the unexpected.',
  ],
  [
    'tranquil',
    '寧靜的',
    'Little moments',
    'The garden is tranquil in the morning.',
  ],
  ['curiosity', '好奇心', 'Personal growth', 'Let curiosity lead the way.'],
  [
    'intentional',
    '有意識的；刻意的',
    'Personal growth',
    'An intentional pause can change your day.',
  ],
  [
    'bloom',
    '開花；茁壯成長',
    'Little moments',
    'These flowers bloom in spring.',
  ],
  ['savor', '細細品味', 'Everyday life', 'Take a moment to savor your coffee.'],
  [
    'gentle',
    '溫柔的',
    'Everyday life',
    'A gentle breeze came through the window.',
  ],
  [
    'perspective',
    '觀點；視角',
    'Personal growth',
    'Travel gives us a new perspective.',
  ],
  ['grateful', '感激的', 'Personal growth', 'I am grateful for your kindness.'],
  ['wonder', '驚奇；好奇', 'Little moments', 'The sky filled her with wonder.'],
  ['rhythm', '節奏', 'Everyday life', 'Find your own rhythm.'],
  ['unwind', '放鬆', 'Everyday life', 'I read to unwind after work.'],
  [
    'thoughtful',
    '體貼的；深思的',
    'Personal growth',
    'That was a thoughtful gift.',
  ],
  ['quiet', '安靜的', '', 'The house is quiet tonight.'],
  [
    'take a breath',
    '深呼吸',
    'Everyday life',
    'Take a breath before you begin.',
  ],
  ['look forward to', '期待', 'Everyday life', 'I look forward to seeing you.'],
  [
    'at your own pace',
    '按照自己的步調',
    'Personal growth',
    'Learn at your own pace.',
  ],
  ['make room for', '為某事留出空間', '', 'Make room for something new.'],
  ['elusive', '難以捉摸的', 'Personal growth', 'The answer was hard to find.'],
  ['write', '寫', 'Everyday life', 'She wrote a letter yesterday.'],
];
export function mockCards(language = 'en') {
  const list =
    language === 'sv'
      ? [
          ['fika', '喝咖啡休息的時光', 'Vardag', 'Vi tar en fika tillsammans.'],
          ['lagom', '恰到好處', 'Vardag', 'Det är lagom varmt idag.'],
          ['skog', '森林', 'Natur', 'Vi går genom en skog.'],
          ['tack', '謝謝', '', 'Tack för hjälpen.'],
          ['god morgon', '早安', 'Vardag', 'God morgon, hur mår du?'],
        ]
      : words;
  return list.map(([word_en, meaning_zh, category, example], i) => {
    const s = initialStats();
    if (i < 12) {
      s.state = 'LEARNING';
      s.interval_days = 3;
      s.success_streak = 2;
      s.next_review_date = new Date(Date.now() - 86400000);
    } else if (i >= 16 && i < 20) {
      s.state = 'MASTERED';
      s.interval_days = 14;
      s.success_streak = 4;
      s.next_review_date = new Date(Date.now() + 7 * 86400000);
      s.mastered_at = new Date();
    }
    return {
      id: `${language}-${i + 1}`,
      word_en,
      meaning_zh,
      category,
      example_en: [example],
      note: i === 0 ? 'A happy accident. A lovely word to keep close.' : '',
      is_starred: [0, 1, 3, 8, 18].includes(i),
      review_stats: s,
      created_at: new Date(Date.now() - i * 3600000),
      updated_at: new Date(),
    };
  });
}
