"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { htmlToText } = require("../server/importer");

test("server-rendered form wrappers preserve the article and exclude form controls", () => {
  const input = `<html><head><title>Oath ceremony</title></head><body>
    <form method="post" action="./oath.aspx" id="form1">
    <input type="hidden" name="__VIEWSTATE" value="opaque-state">
    <input name="password" value="never-read-this-value">
    <textarea>private draft contents</textarea>
    <select><option>private selection</option></select><button>Submit secret form</button>
    <nav>Navigation links</nav><main><h1>Official ceremony record</h1>
    <p>A judicial oath was administered on the recorded date.</p>
    <p>The commission date is a different field.</p></main>
    </form></body></html>`;
  assert.deepEqual(htmlToText(input), {title:"Oath ceremony", text:"Official ceremony record\nA judicial oath was administered on the recorded date.\nThe commission date is a different field."});
});

test("a form wrapper without semantic main still retains visible prose only", () => {
  const r = htmlToText(`<form><input value="credential"><div><p>Retained source paragraph.</p>
  <textarea>not source text</textarea><button>Submit</button><select><option>Ignored</option></select>
  <p>Another source paragraph.</p></div></form>`);
  assert.equal(r.text, "Retained source paragraph.\nAnother source paragraph.");
});

test("control-only forms do not become readable articles", () => {
  assert.equal(htmlToText(`<form><input value="token"><textarea>private message</textarea>
    <select><option>private value</option></select><button>Log in</button></form>`).text, "");
});

test("quoted angle brackets in control attributes never enter source prose", () => {
  const r = htmlToText(`<form action='not>private-route'><p>Official article prose remains.</p>
    <input type="hidden" value="not>SECRET_CONTROL_VALUE">
    <input value='also>PRIVATE_VALUE'><span title="not>ATTRIBUTE_VALUE">End of article.</span></form>`);
  assert.equal(r.text, "Official article prose remains.\nEnd of article.");
});

test("semantic article/main and title attributes remain outside extracted text", () => {
  for (const tag of ["main", "article"]) {
    const r = htmlToText(`<title data-note="x>TITLE_ATTRIBUTE">Record title</title>
      <form><${tag} data-note="x>ATTRIBUTE_NOT_PROSE"><p>Official article prose remains.</p></${tag}></form>`);
    assert.deepEqual(r, {title:"Record title", text:"Official article prose remains."});
  }
});
