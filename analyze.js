function escapeHtml(str) {
  return str.replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[
        c
      ])
  );
}

function getLineNumber(code, snippet) {
  const index = code.indexOf(snippet);
  if (index === -1) return null;
  return code.slice(0, index).split("\n").length;
}

// 요소의 줄 번호를 찾는 함수
function getElementLineNumber(code, element) {
  // 요소의 고유한 특성을 찾아서 줄 번호 계산
  const tagName = element.tagName.toLowerCase();
  const id = element.getAttribute("id");
  const className = element.getAttribute("class");

  let searchPattern = "";

  if (id) {
    searchPattern = `<${tagName}[^>]*id="${id}"`;
  } else if (className) {
    searchPattern = `<${tagName}[^>]*class="${className}"`;
  } else {
    // ID나 class가 없는 경우, 태그 이름으로 찾되 순서를 고려
    const allSameTagElements = Array.from(document.querySelectorAll(tagName));
    const elementIndex = allSameTagElements.indexOf(element);

    const regex = new RegExp(`<${tagName}\\b[^>]*>`, "gi");
    let match;
    let currentIndex = 0;

    while ((match = regex.exec(code)) !== null) {
      if (currentIndex === elementIndex) {
        const beforeText = code.slice(0, match.index);
        return beforeText.split("\n").length;
      }
      currentIndex++;
    }
  }

  if (searchPattern) {
    const regex = new RegExp(searchPattern, "i");
    const match = code.match(regex);
    if (match) {
      const index = code.indexOf(match[0]);
      if (index !== -1) {
        return code.slice(0, index).split("\n").length;
      }
    }
  }

  return null;
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

    // 줄 번호 계산
    const beforeText = code.slice(0, match.index);
    const lineNumber = beforeText.split("\n").length;

    if (!isClosing && !selfClosingTags.includes(tagName)) {
      tagStack.push({ name: tagName, position: match.index, line: lineNumber });
    } else if (isClosing) {
      if (tagStack.length === 0) {
        issues.push(
          `${lineNumber}번째 줄: 닫는 태그 </${tagName}>가 열린 태그 없이 발견됨`
        );
      } else {
        const lastTag = tagStack[tagStack.length - 1];
        if (lastTag.name !== tagName) {
          issues.push(
            `${lineNumber}번째 줄: 태그 불일치로, <${lastTag.name}>가 </${tagName}>로 닫힘`
          );
        } else {
          tagStack.pop();
        }
      }
    }
  }

  if (tagStack.length > 0) {
    tagStack.forEach((tag) => {
      issues.push(`${tag.line}번째 줄: <${tag.name}> 태그가 닫히지 않음`);
    });
  }

  return issues;
}

function analyzeSelect(doc, originalCode) {
  const results = {
    selects: [],
    issues: [],
    successes: [],
  };

  // 마크업 유효성 검사
  const markupIssues = validateMarkup(originalCode);
  if (markupIssues.length > 0) {
    results.issues.push(`${markupIssues[0]}`);
  }

  const selects = doc.querySelectorAll("select");

  if (!selects.length) {
    results.issues.push("유효한 <select> 태그가 없습니다.");
    return results;
  }

  // ID 중복 체크
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
      const lineNumbers = elements
        .map((el) => getElementLineNumber(originalCode, el))
        .filter((ln) => ln !== null);
      const lineInfo =
        lineNumbers.length > 0 ? ` (${lineNumbers.join(", ")}번째 줄)` : "";
      results.issues.push(
        `중복 ID: "${id}"가 ${elements.length}개 요소에서 사용됨${lineInfo}`
      );
    }
  });

  selects.forEach((select, index) => {
    const selectLineNumber = getElementLineNumber(originalCode, select);
    const linePrefix = selectLineNumber ? `${selectLineNumber}번째 줄: ` : "";

    const selectInfo = {
      index: index + 1,
      lineNumber: selectLineNumber,
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
      hasHrElements: select.querySelectorAll("hr").length > 0,
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
          `${linePrefix}Select #${selectInfo.index}: aria-labelledby가 존재하지 않는 ID '${id}'를 참조함`
        );
        return `[ID "${id}" 없음]`;
      });
      selectInfo.ariaLabelledbyText = texts.join(" ");
    }

    // 1. 명시적 label (for 속성)
    if (selectInfo.hasId) {
      const labels = doc.querySelectorAll(`label[for="${selectInfo.id}"]`);
      if (labels.length > 0) {
        selectInfo.hasLabel = true;
        selectInfo.labelText = labels[0].textContent.trim();
        selectInfo.labelType = "for 속성 연결";
        selectInfo.labelValid = true;
        if (labels.length > 1) {
          results.issues.push(
            `${linePrefix}Select #${selectInfo.index}: 동일한 for 속성을 가진 label이 ${labels.length}개 발견됨`
          );
        }
      }
    }

    // 2. 암시적 label (label 내부)
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

    // 3. aria-labelledby를 Label 연결로 인정
    if (!selectInfo.hasLabel && selectInfo.hasAriaLabelledby) {
      selectInfo.hasLabel = true;
      selectInfo.labelText = selectInfo.ariaLabelledbyText;
      selectInfo.labelType = "aria-labelledby";
      selectInfo.labelValid = true;
    }

    // 4. aria-label을 Label 연결로 인정
    if (!selectInfo.hasLabel && selectInfo.hasAriaLabel) {
      selectInfo.hasLabel = true;
      selectInfo.labelText = selectInfo.ariaLabelText;
      selectInfo.labelType = "aria-label";
      selectInfo.labelValid = true;
    }

    // required 속성과 aria-required 속성 검사
    if (select.hasAttribute("required")) {
      if (!select.hasAttribute("aria-required")) {
        results.issues.push(
          `${linePrefix}Select #${selectInfo.index}: required 속성이 있지만 aria-required 속성이 없습니다. 스크린 리더 호환성을 위해 aria-required="true"도 추가하세요.`
        );
      } else if (select.getAttribute("aria-required") !== "true") {
        results.issues.push(
          `${linePrefix}Select #${selectInfo.index}: required 속성이 있을 때 aria-required는 "true"여야 합니다.`
        );
      } else {
        results.successes.push(
          `${linePrefix}Select #${selectInfo.index}: required와 aria-required="true"가 올바르게 함께 사용되었습니다.`
        );
      }
    }

    // 접근성 레이블 제공 여부 최종 판단
    const labelMechanisms = [];
    // 실제 label 요소가 있는지 별도로 체크
    const hasRealLabel =
      selectInfo.labelType === "for 속성 연결" ||
      selectInfo.labelType === "암시적 연결 (label 내부)";

    if (hasRealLabel) labelMechanisms.push("label");
    if (selectInfo.hasAriaLabel) labelMechanisms.push("aria-label");
    if (selectInfo.hasAriaLabelledby) labelMechanisms.push("aria-labelledby");

    if (!selectInfo.hasLabel) {
      results.issues.push(
        `${linePrefix}Select #${selectInfo.index}: 접근 가능한 레이블이 없습니다. label, aria-label, aria-labelledby 중 하나는 필수입니다.`
      );
    } else {
      results.successes.push(
        `${linePrefix}Select #${selectInfo.index}: ${selectInfo.labelType}이 제공되었습니다.`
      );
      if (labelMechanisms.length > 1) {
        results.issues.push(
          `${linePrefix}Select #${
            selectInfo.index
          }: 여러 레이블링 방법(${labelMechanisms.join(
            ", "
          )})이 사용되었습니다. 하나만 사용하는 것을 권장합니다.`
        );
      }
    }

    if (selectInfo.hasHrElements) {
      results.issues.push(
        `${linePrefix}Select #${selectInfo.index}: <hr> 요소는 스크린 리더에 전달되지 않으므로 사용하지 않는 것이 좋습니다.`
      );
    }

    // optgroup의 label 속성 체크
    select.querySelectorAll("optgroup").forEach((optgroup, ogIndex) => {
      if (
        !optgroup.hasAttribute("label") ||
        !optgroup.getAttribute("label").trim()
      ) {
        results.issues.push(
          `${linePrefix}Select #${selectInfo.index}: optgroup #${
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

  // analyzeSelect 호출 시 원본 코드(code)를 두 번째 인자로 전달
  const analysis = analyzeSelect(doc, code);

  let htmlResult = "";

  if (analysis.issues.length > 0) {
    htmlResult += `<section><h2>❌ 접근성 이슈 <span class="badge badge-error">${analysis.issues.length}개</span></h2>`;
    analysis.issues.forEach((issue) => {
      htmlResult += `<div class="issue-item error">${escapeHtml(issue)}</div>`;
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
      const idDisplay = info.hasId ? `id="${info.id}"` : "id 없음";

      htmlResult += `
        <details>
          <summary>▶ Select #${info.index} (${idDisplay})</summary>
          <div style="padding: 1rem 0;">
            <div class="metric"><span class="metric-label">ID명:</span><span class="metric-value ${
              info.hasId ? "ok" : "warn"
            }">${info.hasId ? info.id : "없음"}</span></div>
            <div class="metric"><span class="metric-label">label 연결:</span><span class="metric-value ${
              info.hasLabel ? "ok" : "critical"
            }">${
        info.hasLabel ? `있음 (${info.labelType})` : "없음"
      }</span></div>
            ${
              info.labelText
                ? `<div class="metric"><span class="metric-label">label 이름:</span><span class="metric-value">"${escapeHtml(
                    info.labelText
                  )}"</span></div>`
                : ""
            }
            ${
              info.hasAriaLabel && info.labelType !== "aria-label"
                ? `<div class="metric"><span class="metric-label">aria-label:</span><span class="metric-value">"${escapeHtml(
                    info.ariaLabelText
                  )}"</span></div>`
                : ""
            }
            ${
              info.hasAriaLabelledby && info.labelType !== "aria-labelledby"
                ? `<div class="metric"><span class="metric-label">aria-labelledby:</span><span class="metric-value">"${escapeHtml(
                    info.ariaLabelledbyText
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
        <li><strong>▷ 레이블 필수:</strong> 모든 select 요소는 label, aria-label, 또는 aria-labelledby를 통해 설명을 제공해야 합니다.</li>
        <li><strong>▷ ID 중복 금지:</strong> 페이지 내 모든 ID는 고유해야 합니다. </li>
        <li><strong>▷ 중복 속성 제거:</strong> 같은 용도로 사용되는 속성은 하나만 사용해주세요.</li>
        <li><strong>▷ 의미있는 요소 사용:</strong> select 내부의 <code>&lt;hr&gt;</code>은 스크린 리더에 전달되지 않습니다. <code>&lt;optgroup&gt;</code>으로 그룹화하는 것이 좋습니다.</li>
        <li><strong>▷ 태그 커스텀:</strong> select 요소는 기본적으로 키보드로 접근 가능하지만, 커스텀 스타일링 시에는 주의해야 합니다.</li>
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
