// 버튼을 누를 때마다 횟수를 1씩 올립니다.
const button = document.getElementById("counter-btn");
const countEl = document.getElementById("count");
let count = 0;

button.addEventListener("click", () => {
  count += 1;
  countEl.textContent = count;
});
