// 비속어 탐지기. 공백·특수문자·숫자를 제거하고 흔한 변형(초성, 숫자 끼워넣기, 영문 leet)까지 검사한다.

const BAD_WORDS = [
  // 한국어
  "시발", "씨발", "씨팔", "시팔", "씨빨", "시빨", "씨벌", "시벌", "쓰발", "쓰바", "씨바", "씨이발", "씹새", "씹년", "씹할", "씹창",
  "ㅅㅂ", "ㅆㅂ", "ㅅ발", "ㅆ발", "ㅄ", "ㅂㅅ", "병신", "븅신", "빙신", "병싄", "등신",
  "좆", "좃", "존나", "졸라", "ㅈㄴ", "ㅈㄹ", "지랄", "염병", "옘병",
  "개새끼", "개새", "개색", "개세끼", "개쉐", "개년", "개놈", "새끼", "쌔끼", "섀끼", "ㅅㄲ",
  "미친놈", "미친년", "미친새", "ㅁㅊ", "또라이", "닥쳐", "꺼져", "엿먹", "느금", "니미", "니애미", "니애비",
  "창녀", "걸레년", "썅", "쌍놈", "쌍년", "호로새", "후레자식", "상놈",
  // 영어
  "fuck", "fck", "fuk", "shit", "bitch", "btch", "asshole", "bastard", "pussy", "cunt", "motherfucker", "nigger", "wtf",
];

// 정상 단어에 포함되어 오탐되는 경우 제외
const ALLOW_WORDS = ["새끼손가락", "새끼발가락", "새끼고양이", "새끼강아지", "새끼줄", "수박씨발라", "씨발라먹", "개새우"];

const LEET: Record<string, string> = { "0": "o", "1": "i", "3": "e", "4": "a", "5": "s", "7": "t", "@": "a", "$": "s", "!": "i" };
const KEEP = /[^a-z가-힣ㄱ-ㅎㅏ-ㅣ]/g;

function stripAllowed(t: string) {
  for (const w of ALLOW_WORDS) t = t.split(w).join("");
  return t;
}

export function hasProfanity(text: string): boolean {
  const lower = text.toLowerCase().normalize("NFC");
  const variants = [
    stripAllowed(lower.replace(KEEP, "")),                                   // 시1발, 시 발 → 시발
    stripAllowed(lower.replace(/[013457@$!]/g, (c) => LEET[c]).replace(KEEP, "")), // sh1t → shit
  ];
  return BAD_WORDS.some((w) => variants.some((v) => v.includes(w)));
}

export const PROFANITY_NOTICE = "비속어는 사용 할 수 없습니다.";
