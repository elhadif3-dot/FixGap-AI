export function assertNoArabicLetters(texts: string[]): void {
  const arabicLetters = /[\u0620-\u064A\u066E-\u06D3\u06FA-\u06FC\u0750-\u077F\u08A0-\u08C9\uFB50-\uFDFF\uFE70-\uFEFC]/;
  if (texts.some((text) => arabicLetters.test(text))) {
    throw new Error("Generated narrative contains Arabic letters. Rewrite those narrative fields in correct Hebrew; preserve original source quotations unchanged.");
  }
}
