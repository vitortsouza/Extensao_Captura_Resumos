// tests/extract.test.js - valida o extrator de questões contra um HTML de exemplo.
const fs = require("fs");
const path = require("path");
const assert = require("assert");

let JSDOM;
try {
  ({ JSDOM } = require("jsdom"));
} catch (_) {
  console.error("jsdom não encontrado. Rode: npm install");
  process.exit(1);
}

const html = fs.readFileSync(path.join(__dirname, "question.html"), "utf8");
const dom = new JSDOM(html, {
  url: "https://cursos.alura.com.br/classpage/oci-ai-foundations/task/268271",
  runScripts: "outside-only"
});
const { window } = dom;

// jsdom não implementa innerText; usa textContent como aproximação.
if (!window.HTMLElement.prototype.innerText) {
  Object.defineProperty(window.HTMLElement.prototype, "innerText", {
    get() { return this.textContent; },
    set(value) { this.textContent = value; }
  });
}

window.chrome = {
  runtime: {
    onMessage: { addListener: () => {} },
    sendMessage: (_msg, cb) => cb && cb({ success: true })
  },
  storage: {
    local: {
      get: (_keys, cb) => {
        const data = {};
        if (cb) cb(data);
        return Promise.resolve(data);
      }
    }
  },
  action: {
    setBadgeText: () => {},
    setBadgeBackgroundColor: () => {}
  }
};

window.eval(fs.readFileSync(path.join(__dirname, "..", "content.js"), "utf8"));

const result = window.eval(`(function () {
  return { isPage: isQuestionPage(), question: extractQuestion(), course: getCourseName() };
})()`);

assert.strictEqual(result.isPage, true, "isQuestionPage deveria detectar a questão");
assert.ok(result.question, "extractQuestion deveria retornar uma questão");
assert.strictEqual(result.question.options.length, 4, "deveriam existir 4 alternativas");
assert.deepStrictEqual(
  Array.from(result.question.options, (o) => o.label),
  ["A", "B", "C", "D"],
  "as letras deveriam ser A, B, C, D"
);
assert.strictEqual(result.question.correctLabel, "C", "a correta deveria ser C");
assert.match(result.question.correctExplanation, /Correta, o texto define alucinação/i);
assert.strictEqual(result.question.courseName, "OCI AI: Foundations Associate");
assert.ok(result.question.id, "a questão deveria ter id estável");

console.log("✓ extract.test.js: 4 alternativas, correta C, explicação e curso capturados.");
dom.window.close();
