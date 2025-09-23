function escapeHtml(str) {
  return str.replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[
        c
      ])
  );
}

// HTML 마크업 유효성 검사
function validateMarkup(code) {
  const issues = [];
  const tagStack = [];
  const selfClosingTags = [
    "area",
    "base",
    "br",
    "col",
    "embed",
    "hr",
    "img",
    "input",
    "link",
    "meta",
    "param",
    "source",
    "track",
    "wbr",
  ];
  const tagRegex = /<\/?([a-zA-Z][a-zA-Z0-9]*)\b[^>]*>/g;

  let match;
  while ((match = tagRegex.exec(code)) !== null) {
    const isClosing = match[0].startsWith("</");
    const tagName = match[1].toLowerCase();

    if (!isClosing && !selfClosingTags.includes(tagName)) {
      tagStack.push({ name: tagName, position: match.index });
    } else if (isClosing) {
      if (tagStack.length === 0) {
        issues.push(`닫는 태그 </${tagName}>가 열린 태그 없이 발견됨`);
      } else {
        const lastTag = tagStack[tagStack.length - 1];
        if (lastTag.name !== tagName) {
          issues.push(`태그 불일치: <${lastTag.name}>가 </${tagName}>로 닫힘`);
        } else {
          tagStack.pop();
        }
      }
    }
  }

  tagStack.forEach((tag) => {
    issues.push(`<${tag.name}> 태그가 닫히지 않음`);
  });

  return issues;
}

/**
 * select 요소의 접근성과 마크업을 분석합니다.
 * @param {Document} doc - 파싱된 HTML 문서 객체
 * @param {string} originalCode - 사용자가 입력한 원본 HTML 문자열
 * @returns {object} 분석 결과 객체
 */
function analyzeSelect(doc, originalCode) {
  // 1. 결과 객체를 모든 카테고리를 포함하여 초기화
  const results = {
    selects: [],
    criticalIssues: [],
    issues: [],
    warnings: [],
    successes: [],
  };

  // 2. 마크업 유효성 검사를 '치명적 문제'로 분류
  const markupIssues = validateMarkup(originalCode);
  if (markupIssues.length > 0) {
    markupIssues.forEach((issue) => {
      results.criticalIssues.push(`마크업 오류: ${issue}`);
    });
  }

  const selects = doc.querySelectorAll("select");

  if (!selects.length) {
    results.issues.push("유효한 <select> 태그가 없습니다.");
    return results;
  }

  // 3. ID 중복 체크를 '치명적 문제'로 분류
  const idMap = new Map();
  const allElements = doc.querySelectorAll("[id]");
  allElements.forEach((el) => {
    const id = el.getAttribute("id");
    if (id) {
      // ID가 비어있지 않은 경우에만 체크
      if (idMap.has(id)) {
        idMap.get(id).push(el);
      } else {
        idMap.set(id, [el]);
      }
    }
  });

  idMap.forEach((elements, id) => {
    if (elements.length > 1) {
      results.criticalIssues.push(
        `중복된 ID 발견: "${id}"가 ${elements.length}개 요소에서 사용됨`
      );
    }
  });

  selects.forEach((select, index) => {
    // 4. selectInfo 객체에 누락된 속성(optionsWithoutValue 등)을 0으로 초기화
    const selectInfo = {
      index: index + 1,
      hasId: select.hasAttribute("id"),
      id: select.getAttribute("id") || "",
      hasLabel: false,
      labelText: "",
      labelType: "",
      labelValid: false,
      hasAriaLabel: select.hasAttribute("aria-label"),
      ariaLabelText: select.getAttribute("aria-label") || "",
      hasAriaLabelledby: select.hasAttribute("aria-labelledby"),
      ariaLabelledbyText: "",
      hasAriaDescribedby: select.hasAttribute("aria-describedby"),
      hasTitle: select.hasAttribute("title"),
      titleText: select.getAttribute("title") || "",
      isDisabled: select.hasAttribute("disabled"),
      hasHrElements: select.querySelectorAll("hr").length > 0,
      optionsCount: select.options.length,
      optionsWithoutValue: 0,
      disabledOptionsCount: 0,
      hasEmptyOption: false,
      duplicateAriaAttributes: [],
    };

    // aria-labelledby 검증
    if (selectInfo.hasAriaLabelledby) {
      const ids = select.getAttribute("aria-labelledby").split(/\s+/);
      const texts = ids.map((id) => {
        const el = doc.getElementById(id);
        if (el) return el.textContent.trim();
        results.issues.push(
          `Select #${selectInfo.index}: aria-labelledby가 존재하지 않는 ID '${id}'를 참조함`
        );
        return `[ID "${id}" 없음]`;
      });
      selectInfo.ariaLabelledbyText = texts.join(" ");
    }

    // Label 연결 체크 (명시적, 암시적)
    if (selectInfo.hasId) {
      const labels = doc.querySelectorAll(`label[for="${selectInfo.id}"]`);
      if (labels.length > 0) {
        selectInfo.hasLabel = true;
        selectInfo.labelText = labels[0].textContent.trim();
        selectInfo.labelType = "for 속성 연결";
        selectInfo.labelValid = true;
        if (labels.length > 1) {
          results.warnings.push(
            `Select #${selectInfo.index}: 동일한 for 속성을 가진 label이 ${labels.length}개 발견됨`
          );
        }
      }
    }

    if (!selectInfo.hasLabel) {
      const parentLabel = select.closest("label");
      if (parentLabel) {
        selectInfo.hasLabel = true;
        const clone = parentLabel.cloneNode(true);
        clone.querySelector("select")?.remove();
        selectInfo.labelText = clone.textContent.trim();
        selectInfo.labelType = "암시적 연결 (label 내부)";
        selectInfo.labelValid = true;
      }
    }

    // Options 분석
    Array.from(select.options).forEach((option) => {
      if (
        !option.hasAttribute("value") ||
        option.getAttribute("value") === ""
      ) {
        if (
          option.textContent.trim() === "" ||
          option.textContent.includes("--") ||
          option.textContent.includes("선택")
        ) {
          selectInfo.hasEmptyOption = true;
        } else {
          selectInfo.optionsWithoutValue++;
        }
      }
      if (option.hasAttribute("disabled")) {
        selectInfo.disabledOptionsCount++;
      }
    });

    // 5. 중복 속성 및 상태 속성 검사를 '경고'로 분류
    if (
      select.hasAttribute("required") &&
      select.hasAttribute("aria-required")
    ) {
      selectInfo.duplicateAriaAttributes.push("required와 aria-required");
      results.warnings.push(
        `Select #${selectInfo.index}: required와 aria-required가 동시에 사용됨. required만 사용하세요.`
      );
    }

    if (select.getAttribute("aria-invalid") === "true") {
      results.warnings.push(
        `Select #${selectInfo.index}: aria-invalid="true"로 설정됨. 폼 검증 상태를 명확히 관리하세요.`
      );
    }

    // 접근성 레이블 제공 여부 최종 판단
    const labelMechanisms = [];
    if (selectInfo.hasLabel) labelMechanisms.push("label");
    if (selectInfo.hasAriaLabel) labelMechanisms.push("aria-label");
    if (selectInfo.hasAriaLabelledby) labelMechanisms.push("aria-labelledby");
    if (selectInfo.hasTitle) labelMechanisms.push("title");

    if (labelMechanisms.length === 0) {
      results.criticalIssues.push(
        `Select #${selectInfo.index}: 접근 가능한 레이블이 없습니다. label, aria-label, aria-labelledby 또는 title 중 하나는 필수입니다.`
      );
    } else {
      results.successes.push(
        `Select #${selectInfo.index}: 접근 가능한 이름(${labelMechanisms[0]})이 제공되었습니다.`
      );
      if (labelMechanisms.length > 1) {
        results.warnings.push(
          `Select #${
            selectInfo.index
          }: 여러 레이블링 방법(${labelMechanisms.join(
            ", "
          )})이 사용되었습니다. 하나만 사용하는 것을 권장합니다.`
        );
      }
      if (labelMechanisms.includes("title") && labelMechanisms.length === 1) {
        results.warnings.push(
          `Select #${selectInfo.index}: title 속성만으로 레이블을 제공하는 것은 권장하지 않습니다. <label>을 사용하세요.`
        );
      }
    }

    if (selectInfo.hasHrElements) {
      results.issues.push(
        `Select #${selectInfo.index}: <hr> 요소는 스크린 리더에 전달되지 않으므로 사용하지 않는 것이 좋습니다.`
      );
    }

    // optgroup의 label 속성 체크
    select.querySelectorAll("optgroup").forEach((optgroup, ogIndex) => {
      if (
        !optgroup.hasAttribute("label") ||
        !optgroup.getAttribute("label").trim()
      ) {
        results.issues.push(
          `Select #${selectInfo.index}: optgroup #${
            ogIndex + 1
          }에 label 속성이 없거나 비어있습니다.`
        );
      }
    });

    results.selects.push(selectInfo);
  });

  return results;
}

document.getElementById("checkBtn").onclick = function () {
  const code = document.getElementById("input").value.trim();
  const resultDiv = document.getElementById("result");
  resultDiv.style.display = "flex";

  if (!code) {
    resultDiv.innerHTML =
      '<span class="critical">※ HTML 코드를 입력해주세요.</span>';
    return;
  }

  const parser = new DOMParser();
  const doc = parser.parseFromString(`<body>${code}</body>`, "text/html");

  const parserErrors = doc.querySelector("parsererror");
  if (parserErrors) {
    resultDiv.innerHTML = `<div class="parse-error">⚠️ HTML 파싱 오류: 유효한 HTML 코드인지 확인해주세요.<br>${escapeHtml(
      parserErrors.textContent
    )}</div>`;
    return;
  }

  // 6. analyzeSelect 호출 시 원본 코드(code)를 두 번째 인자로 전달
  const analysis = analyzeSelect(doc, code);

  let htmlResult = "";

  // 7. 모든 카테고리(치명적, 이슈, 경고, 성공)를 화면에 표시하도록 로직 개선
  if (analysis.criticalIssues.length > 0) {
    htmlResult += `<section><h2>🚨 치명적 문제 <span class="badge badge-critical">${analysis.criticalIssues.length}개</span></h2>`;
    analysis.criticalIssues.forEach((issue) => {
      htmlResult += `<div class="issue-item critical">${escapeHtml(
        issue
      )}</div>`;
    });
    htmlResult += `</section>`;
  }

  if (analysis.issues.length > 0) {
    htmlResult += `<section><h2>❌ 접근성 이슈 <span class="badge badge-error">${analysis.issues.length}개</span></h2>`;
    analysis.issues.forEach((issue) => {
      htmlResult += `<div class="issue-item error">${escapeHtml(issue)}</div>`;
    });
    htmlResult += `</section>`;
  }

  if (analysis.warnings.length > 0) {
    htmlResult += `<section><h2>⚠️ 경고 사항 <span class="badge badge-warning">${analysis.warnings.length}개</span></h2>`;
    analysis.warnings.forEach((warning) => {
      htmlResult += `<div class="issue-item warning">${escapeHtml(
        warning
      )}</div>`;
    });
    htmlResult += `</section>`;
  }

  if (analysis.successes.length > 0) {
    htmlResult += `<section><h2>✅ 올바른 구현 <span class="badge badge-success">${analysis.successes.length}개</span></h2>`;
    analysis.successes.forEach((success) => {
      htmlResult += `<div class="issue-item success">${escapeHtml(
        success
      )}</div>`;
    });
    htmlResult += `</section>`;
  }

  // 상세 분석
  if (analysis.selects.length > 0) {
    htmlResult += `<section><h2>📊 상세 정보</h2>`;
    analysis.selects.forEach((info) => {
      htmlResult += `
        <details>
          <summary>▶ Select #${info.index} ${
        info.id ? `(id="${info.id}")` : "(id 없음)"
      }</summary>
          <div style="padding: 1rem 0;">
            <div class="metric"><span class="metric-label">ID 속성:</span><span class="metric-value ${
              info.hasId ? "ok" : "warn"
            }">${info.hasId ? info.id : "없음"}</span></div>
            <div class="metric"><span class="metric-label">Label 연결:</span><span class="metric-value ${
              info.hasLabel ? "ok" : "critical"
            }">${
        info.hasLabel ? `있음 (${info.labelType})` : "없음"
      }</span></div>
            ${
              info.labelText
                ? `<div class="metric"><span class="metric-label">Label 텍스트:</span><span class="metric-value">"${escapeHtml(
                    info.labelText
                  )}"</span></div>`
                : ""
            }
            ${
              info.hasAriaLabel
                ? `<div class="metric"><span class="metric-label">aria-label:</span><span class="metric-value">"${escapeHtml(
                    info.ariaLabelText
                  )}"</span></div>`
                : ""
            }
            ${
              info.hasAriaLabelledby
                ? `<div class="metric"><span class="metric-label">aria-labelledby:</span><span class="metric-value">"${escapeHtml(
                    info.ariaLabelledbyText
                  )}"</span></div>`
                : ""
            }
            ${
              info.hasTitle
                ? `<div class="metric"><span class="metric-label">title 속성:</span><span class="metric-value">"${escapeHtml(
                    info.titleText
                  )}"</span></div>`
                : ""
            }
            ${
              info.hasHrElements
                ? `<div class="metric"><span class="metric-label">HR 요소:</span><span class="metric-value critical">⚠️ 접근성 문제 있음</span></div>`
                : ""
            }
            ${
              info.duplicateAriaAttributes.length > 0
                ? `<div class="metric"><span class="metric-label">중복 속성:</span><span class="metric-value warn">${info.duplicateAriaAttributes.join(
                    ", "
                  )}</span></div>`
                : ""
            }
            <div class="metric"><span class="metric-label">비활성화 상태:</span><span class="metric-value">${
              info.isDisabled ? "비활성화" : "활성화"
            }</span></div>
          </div>
        </details>`;
    });
    htmlResult += `</section>`;
  }

  // 미리보기 및 접근성 가이드
  htmlResult += `<section>
    <h2>👁️ 코드 미리보기</h2>
    <div class="preview-wrap">${code}</div>
    </section>`;
  htmlResult += `<section>
    <h2>💡Tip: 접근성 점검 사항</h2>
    <ul>
        <li><strong>▷ 레이블 필수:</strong> 모든 select 요소는 label, aria-label, 또는 aria-labelledby를 통해 명확한 설명을 제공해야 합니다.</li>
        <li><strong>▷ ID 중복 금지:</strong> 페이지 내 모든 ID는 고유해야 합니다. 중복된 ID는 label 연결 및 보조기기 작동을 방해합니다.</li>
        <li><strong>▷ 중복 속성 제거:</strong> <code>required</code>와 <code>aria-required</code> 같은 의미가 중복되는 속성은 하나만 사용하세요.</li>
        <li><strong>▷ 의미있는 요소 사용:</strong> select 내부의 <code>&lt;hr&gt;</code>은 스크린 리더에 전달되지 않습니다. <code>&lt;optgroup&gt;</code>으로 그룹화하는 것이 좋습니다.</li>
        <li><strong>▷ 키보드 접근성:</strong> select 요소는 기본적으로 키보드로 접근 가능하지만, 커스텀 스타일링 시 키보드 함정(keyboard trap)이 발생하지 않도록 주의해야 합니다.</li>
    </ul>
    </section>`;

  resultDiv.innerHTML = htmlResult;
};

document.addEventListener("DOMContentLoaded", function () {
  const textarea = document.getElementById("input");
  if (textarea.value === "") {
    textarea.placeholder = `여기에 <select> ... </select> 코드를 붙여넣으세요.`;
  }
});
