function escapeHtml(str) {
    return str.replace(/[&<>"']/g, c =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])
    );
}

function analyzeSelect(doc) {
    const results = {
    selects: [],
    issues: [],
    successes: []
    };

    const selects = doc.querySelectorAll('select');
    
    if (!selects.length) {
    results.issues.push('유효한 &lt;select&gt; 태그가 없습니다.');
    return results;
    }

    selects.forEach((select, index) => {
    const selectInfo = {
        index: index + 1,
        hasId: false,
        hasName: false,
        hasLabel: false,
        labelText: '',
        labelType: '',
        hasAriaLabel: false,
        ariaLabelText: '',
        hasAriaLabelledby: false,
        ariaLabelledbyText: '',
        isMultiple: false,
        size: 1,
        isRequired: false,
        isDisabled: false,
        hasForm: false,
        formId: '',
        optionsCount: 0,
        optgroupsCount: 0,
        hasEmptyOption: false,
        hasHrElements: false,
        disabledOptionsCount: 0,
        optionsWithoutValue: 0
    };

    // 기본 속성 체크
    selectInfo.hasId = select.hasAttribute('id');
    selectInfo.id = select.getAttribute('id') || '';
    selectInfo.hasName = select.hasAttribute('name');
    selectInfo.name = select.getAttribute('name') || '';
    selectInfo.isMultiple = select.hasAttribute('multiple');
    selectInfo.size = parseInt(select.getAttribute('size')) || 1;
    selectInfo.isRequired = select.hasAttribute('required');
    selectInfo.isDisabled = select.hasAttribute('disabled');
    selectInfo.hasForm = select.hasAttribute('form');
    selectInfo.formId = select.getAttribute('form') || '';

    // ARIA 속성 체크
    selectInfo.hasAriaLabel = select.hasAttribute('aria-label');
    selectInfo.ariaLabelText = select.getAttribute('aria-label') || '';
    selectInfo.hasAriaLabelledby = select.hasAttribute('aria-labelledby');
    const ariaLabelledbyId = select.getAttribute('aria-labelledby');
    if (ariaLabelledbyId) {
        const labelElement = doc.getElementById(ariaLabelledbyId);
        selectInfo.ariaLabelledbyText = labelElement ? labelElement.textContent.trim() : '[요소를 찾을 수 없음]';
    }

    // Label 연결 체크
    if (selectInfo.hasId && selectInfo.id) {
        const label = doc.querySelector(`label[for="${selectInfo.id}"]`);
        if (label) {
        selectInfo.hasLabel = true;
        selectInfo.labelText = label.textContent.trim();
        selectInfo.labelType = 'for 속성 연결';
        }
    }
    
    // 암시적 label 체크 (select가 label 안에 있는 경우)
    if (!selectInfo.hasLabel) {
        const parentLabel = select.closest('label');
        if (parentLabel) {
        selectInfo.hasLabel = true;
        selectInfo.labelText = parentLabel.textContent.trim().replace(select.textContent.trim(), '').trim();
        selectInfo.labelType = '암시적 연결 (label 내부)';
        }
    }

    // Options 분석
    const options = select.querySelectorAll('option');
    selectInfo.optionsCount = options.length;
    
    options.forEach(option => {
        if (!option.hasAttribute('value') || option.getAttribute('value') === '') {
        if (option.textContent.trim() === '' || option.textContent.includes('--') || option.textContent.includes('선택')) {
            selectInfo.hasEmptyOption = true;
        } else {
            selectInfo.optionsWithoutValue++;
        }
        }
        if (option.hasAttribute('disabled')) {
        selectInfo.disabledOptionsCount++;
        }
    });

    // Optgroup 체크
    const optgroups = select.querySelectorAll('optgroup');
    selectInfo.optgroupsCount = optgroups.length;

    // HR 요소 체크 
    const hrElements = select.querySelectorAll('hr');
    selectInfo.hasHrElements = hrElements.length > 0;

    // 점수 계산 및 이슈 판단
    if (!selectInfo.hasLabel && !selectInfo.hasAriaLabel && !selectInfo.hasAriaLabelledby) {
        results.issues.push(`Select #${selectInfo.index}: 레이블이 없습니다. label, aria-label 또는 aria-labelledby 중 하나는 필수입니다.`);
    } else if (selectInfo.hasLabel) {
        results.successes.push(`Select #${selectInfo.index}: 적절한 레이블이 연결되어 있습니다 (${selectInfo.labelType}).`);
    } else if (selectInfo.hasAriaLabel) {
        results.successes.push(`Select #${selectInfo.index}: aria-label이 제공되었습니다.`);
    } else if (selectInfo.hasAriaLabelledby) {
        results.successes.push(`Select #${selectInfo.index}: aria-labelledby로 레이블이 연결되어 있습니다.`);
    }

    if (!selectInfo.hasId) {
        results.issues.push(`Select #${selectInfo.index}: id 속성이 없습니다. label과 연결하려면 id가 필요합니다.`);
    }

    if (!selectInfo.hasName) {
        results.issues.push(`Select #${selectInfo.index}: name 속성이 없습니다. 폼 제출 시 필요합니다.`);
    }

    if (selectInfo.hasHrElements) {
        results.issues.push(`Select #${selectInfo.index}: &lt;hr&gt; 요소를 포함하고 있습니다. hr 요소는 접근성 트리에 노출되지 않아 스크린 리더 사용자에게 전달되지 않습니다.`);
    }

    if (selectInfo.isRequired && !selectInfo.hasEmptyOption) {
        results.issues.push(`Select #${selectInfo.index}: required 속성이 있지만 빈 옵션이 없습니다. 사용자가 선택을 취소할 수 없습니다.`);
    }

    if (selectInfo.optionsWithoutValue > 0) {
        results.issues.push(`Select #${selectInfo.index}: value 속성이 없는 옵션이 ${selectInfo.optionsWithoutValue}개 있습니다.`);
    }

    if (selectInfo.optionsCount === 0) {
        results.issues.push(`Select #${selectInfo.index}: 옵션이 하나도 없습니다.`);
    }

    if (selectInfo.isMultiple) {
        results.successes.push(`Select #${selectInfo.index}: multiple 속성이 있어 다중 선택이 가능합니다.`);
    }

    if (selectInfo.optgroupsCount > 0) {
        results.successes.push(`Select #${selectInfo.index}: optgroup을 사용하여 옵션을 논리적으로 그룹화했습니다.`);
    }

    results.selects.push(selectInfo);
    });

    return results;
}

document.getElementById('checkBtn').onclick = function() {
    const code = document.getElementById('input').value.trim();
    const resultDiv = document.getElementById('result');
    resultDiv.style.display = 'flex';
    
    if (!code) {
    resultDiv.innerHTML = '<span class="warn">※ HTML 코드를 입력해주세요.</span>';
    return;
    }

    // HTML 파싱
    const parser = new DOMParser();
    const doc = parser.parseFromString(`<body>${code}</body>`, 'text/html');
    
    // 분석 실행
    const analysis = analyzeSelect(doc);
    
    // 결과 HTML 생성
    let htmlResult = '';

    // 주요 이슈
    if (analysis.issues.length > 0) {
    htmlResult += `<section>
        <h2>❌ 접근성 이슈 <span class="badge badge-error">${analysis.issues.length}개</span></h2>`;
    analysis.issues.forEach(issue => {
        htmlResult += `<div class="issue-item error">${issue}</div>`;
    });
    htmlResult += `</section>`;
    }

    // 성공 항목
    if (analysis.successes.length > 0) {
    htmlResult += `<section>
        <h2>✅ 접근성 구현 사항 <span class="badge badge-success">${analysis.successes.length}개</span></h2>`;
    analysis.successes.forEach(success => {
        htmlResult += `<div class="issue-item success">${escapeHtml(success)}</div>`;
    });
    htmlResult += `</section>`;
    }

    // 상세 분석
    if (analysis.selects.length > 0) {
    htmlResult += `<section>
        <h2>📊 상세 정보</h2>`;
    
    analysis.selects.forEach(selectInfo => {
        htmlResult += `<details>
        <summary>▶ Select #${selectInfo.index} ${selectInfo.id ? `(id="${selectInfo.id}")` : '(id 없음)'}</summary>
        <div style="padding: 1rem 0;">
            <div class="metric">
            <span class="metric-label">id 속성:</span>
            <span class="metric-value ${selectInfo.hasId ? 'ok' : 'warn'}">${selectInfo.hasId ? selectInfo.id : '없음'}</span>
            </div>
            <div class="metric">
            <span class="metric-label">name 속성:</span>
            <span class="metric-value ${selectInfo.hasName ? 'ok' : 'warn'}">${selectInfo.hasName ? selectInfo.name : '없음'}</span>
            </div>
            <div class="metric">
            <span class="metric-label">label 연결:</span>
            <span class="metric-value ${selectInfo.hasLabel ? 'ok' : 'warn'}">${selectInfo.hasLabel ? `있음 (${selectInfo.labelType})` : '없음'}</span>
            </div>
            ${selectInfo.labelText ? `
            <div class="metric">
            <span class="metric-label">Label 텍스트:</span>
            <span class="metric-value">"${escapeHtml(selectInfo.labelText)}"</span>
            </div>` : ''}
            ${selectInfo.hasAriaLabel ? `
            <div class="metric">
            <span class="metric-label">aria-label:</span>
            <span class="metric-value">"${escapeHtml(selectInfo.ariaLabelText)}"</span>
            </div>` : ''}
            ${selectInfo.hasAriaLabelledby ? `
            <div class="metric">
            <span class="metric-label">aria-labelledby:</span>
            <span class="metric-value">"${escapeHtml(selectInfo.ariaLabelledbyText)}"</span>
            </div>` : ''}
            <div class="metric">
            <span class="metric-label">Optgroup 사용:</span>
            <span class="metric-value ${selectInfo.optgroupsCount > 0 ? 'info' : ''}">
                ${selectInfo.optgroupsCount > 0 ? `${selectInfo.optgroupsCount}개` : '사용 안 함'}
            </span>
            </div>
            <div class="metric">
            <div class="metric">
            <span class="metric-label">필수 입력값 여부(required):</span>
            <span class="metric-value">${selectInfo.isRequired ? '필수 입력값' : '선택 입력값'}</span>
            </div>
            ${selectInfo.hasHrElements ? `
            <div class="metric">
            <span class="metric-label">HR 요소:</span>
            <span class="metric-value warn">⚠️ 존재</span>
            </div>` : ''}
            ${selectInfo.disabledOptionsCount > 0 ? `
            <div class="metric">
            <span class="metric-label">비활성화된 옵션:</span>
            <span class="metric-value">${selectInfo.disabledOptionsCount}개</span>
            </div>` : ''}
        </div>
        </details>`;
    });
    
    htmlResult += `</section>`;
    }

    // 미리보기
    htmlResult += `<section>
    <h2>👁️ 코드 미리보기</h2>
    <div class="preview-wrap">${code}</div>
    </section>`;

    // 접근성 점검 사항
    htmlResult += `<section>
    <h2>💡Tip: 접근성 점검 사항</h2>
    <ul>
        <li><strong>▷ 레이블 필수:</strong> 모든 select 요소는 label, aria-label, 또는 aria-labelledby를 통해 명확한 설명을 제공해야 합니다.</li>
        <li><strong>▷ id와 name 속성:</strong> id는 label과 연결하기 위해, name은 폼 데이터 전송을 위해 필요합니다.</li>
        <li><strong>▷ hr 요소:</strong> select 내부의 &lt;hr&gt; 적용되지 않습니다.</li>
        <li><strong>▷ optgroup 활용:</strong> 옵션이 여러 개라면, optgroup으로 그룹을 만들어주면 탐색이 쉽습니다.</li>
        <li><strong>▷ 기본값 제공:</strong> "선택하세요" 같은 빈 옵션을 첫 번째로 제공하는 것이 좋습니다.</li>
        <li><strong>▷ 키보드 접근성:</strong> select 요소는 기본적으로 키보드로 접근 가능하지만, 커스텀 스타일링 시 주의가 필요합니다.</li>
    </ul>
    </section>`;

    resultDiv.innerHTML = htmlResult;
};

// 예제 코드 자동 입력
document.addEventListener('DOMContentLoaded', function() {
    const textarea = document.getElementById('input');
    if (textarea.value === '') {
    textarea.placeholder = `여기에 <select> ... </select> 코드를 붙여넣으세요.`;
    }
});
