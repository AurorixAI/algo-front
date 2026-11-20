// The words of the server for the sum at once in a window of enrolment (`billing.immediate.lines` / `immediate_total.lines`, PAY-DUE 10.4; `payments_texts.immediate_lines`).  The tests build the answers with them,
// the screen shows them: «К оплате до 24.11: 188 000 сум (за 5 уроков)» / «Всего к оплате до 24.11: …».
const NBSP = " ";
const money = (amount) => `${String(Math.round(amount)).replace(/\B(?=(\d{3})+(?!\d))/g, NBSP)}${NBSP}сум`;
const lessonsWord = (n) => (n % 10 === 1 && n % 100 !== 11 ? "урок" : [2, 3, 4].includes(n % 10) && ![12, 13, 14].includes(n % 100) ? "урока" : "уроков");
const tail = (lessons) => (lessons ? ` (за ${lessons} ${lessonsWord(lessons)})` : "");
/** the sentence of one student: a sum in term (default), or a debt from the first day (`debt: true`, with the day the term was). */
const dueLines = (amount, lessons, { until = "24.11", debt = false, was = null, total = false } = {}) => {
  if (debt) return [`${total ? "Всего долг сразу" : "Долг сразу"}: ${money(amount)}${tail(lessons)}${was ? ` · срок был ${was}` : ""}`];
  return [`${total ? "Всего к оплате" : "К оплате"}${until ? ` до ${until}` : ""}: ${money(amount)}${tail(lessons)}`];
};
module.exports = { money, dueLines };
