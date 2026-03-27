const sciExpressionEl = document.getElementById('sci-expression');
const sciResultEl = document.getElementById('sci-result');
const angleModeEl = document.getElementById('angle-mode');
const toggleAngleBtn = document.getElementById('toggle-angle');
const calcExpressionEl = document.getElementById('calc-expression');
const calcResultEl = document.getElementById('calc-result');

const basicExpressionEl = document.getElementById('basic-expression');
const basicResultEl = document.getElementById('basic-result');

const sciState = {
  expr: '',
  angle: 'DEG',
  last: 0
};

const basicState = {
  expr: ''
};

const functionsMap = [
  'sin',
  'cos',
  'tan',
  'asin',
  'acos',
  'atan',
  'sinh',
  'cosh',
  'tanh',
  'log',
  'ln',
  'sqrt',
  'square',
  'cube',
  'pow10',
  'exp',
  'abs',
  'recip'
];

function getConstantsMap(ansValue) {
  return {
    pi: Math.PI,
    e: Math.E,
    ans: ansValue
  };
}

function formatExpression(expr) {
  return expr
    .replaceAll('*', '×')
    .replaceAll('/', '÷')
    .replaceAll('-', '−');
}

function formatResult(value) {
  const absVal = Math.abs(value);
  if (absVal === 0) {
    return '0';
  }
  if (absVal >= 1e12 || absVal < 1e-9) {
    return value.toExponential(6);
  }
  return parseFloat(value.toPrecision(12)).toString();
}

function updateSciDisplay(result = null) {
  if (!sciExpressionEl || !sciResultEl) {
    return;
  }
  sciExpressionEl.textContent = formatExpression(sciState.expr);
  if (result !== null) {
    sciResultEl.textContent = result;
  }
}

function updateBasicDisplay(result = null) {
  if (!basicExpressionEl || !basicResultEl) {
    return;
  }
  basicExpressionEl.textContent = formatExpression(basicState.expr);
  if (result !== null) {
    basicResultEl.textContent = result;
  }
}

function updateCalcDisplay(expression, result = null) {
  if (!calcExpressionEl || !calcResultEl) {
    return;
  }
  calcExpressionEl.textContent = formatExpression(expression);
  if (result !== null) {
    calcResultEl.textContent = result;
  }
}

function setAngleMode() {
  if (!angleModeEl) {
    return;
  }
  angleModeEl.textContent = sciState.angle;
}

function appendToExpression(state, value) {
  state.expr += value;
}

function clearExpression(state, updateFn) {
  state.expr = '';
  updateFn('0');
}

function backspaceExpression(state, updateFn) {
  state.expr = state.expr.slice(0, -1);
  if (state.expr.length === 0) {
    updateFn('0');
  } else {
    updateFn(null);
  }
}

function handleResult(state, updateFn, setLast = false) {
  try {
    const resultValue = evaluateExpression(state.expr, sciState.angle, sciState.last);
    const formatted = formatResult(resultValue);
    updateFn(formatted);
    state.expr = formatted;
    if (setLast) {
      sciState.last = resultValue;
    }
  } catch (error) {
    updateFn('Error');
  }
}

function shouldInsertImplicit(prevType, nextType) {
  const left = ['number', 'const', 'var', 'close', 'postfix'];
  const right = ['number', 'const', 'var', 'func', 'open'];
  return left.includes(prevType) && right.includes(nextType);
}

function tokenize(expr, ansValue) {
  const tokens = [];
  const clean = expr.replace(/\s+/g, '');
  let i = 0;
  let prevType = null;

  const addToken = (token, tokenType) => {
    if (prevType && shouldInsertImplicit(prevType, tokenType)) {
      tokens.push({ type: 'op', value: '*' });
    }
    tokens.push(token);
    prevType = tokenType;
  };

  while (i < clean.length) {
    const char = clean[i];
    if (/[0-9.]/.test(char)) {
      let num = char;
      i += 1;
      while (i < clean.length && /[0-9.]/.test(clean[i])) {
        num += clean[i];
        i += 1;
      }
      if (num.split('.').length > 2) {
        throw new Error('Invalid number');
      }
      addToken({ type: 'number', value: parseFloat(num) }, 'number');
      continue;
    }
    if (/[a-z]/i.test(char)) {
      let word = char;
      i += 1;
      while (i < clean.length && /[a-z]/i.test(clean[i])) {
        word += clean[i];
        i += 1;
      }
      const lower = word.toLowerCase();
      if (lower === 'x') {
        addToken({ type: 'var', value: 'x' }, 'var');
      } else if (lower === 'mod') {
        addToken({ type: 'op', value: 'mod' }, 'operator');
      } else if (functionsMap.includes(lower)) {
        addToken({ type: 'func', value: lower }, 'func');
      } else if (lower in getConstantsMap(ansValue)) {
        addToken({ type: 'const', value: lower }, 'const');
      } else {
        throw new Error('Unknown token');
      }
      continue;
    }
    if ('+-*/^()'.includes(char)) {
      if (char === '(') {
        addToken({ type: 'op', value: char }, 'open');
      } else if (char === ')') {
        addToken({ type: 'op', value: char }, 'close');
      } else {
        addToken({ type: 'op', value: char }, 'operator');
      }
      i += 1;
      continue;
    }
    if (char === '%') {
      addToken({ type: 'postfix', value: 'pct' }, 'postfix');
      i += 1;
      continue;
    }
    if (char === '!') {
      addToken({ type: 'postfix', value: 'fact' }, 'postfix');
      i += 1;
      continue;
    }
    throw new Error('Invalid character');
  }
  return tokens;
}

function toRpn(tokens) {
  const output = [];
  const stack = [];
  const operators = {
    '+': { prec: 2, assoc: 'L' },
    '-': { prec: 2, assoc: 'L' },
    '*': { prec: 3, assoc: 'L' },
    '/': { prec: 3, assoc: 'L' },
    'mod': { prec: 3, assoc: 'L' },
    '^': { prec: 4, assoc: 'R' },
    'u-': { prec: 5, assoc: 'R' }
  };

  let prevType = null;
  tokens.forEach((token) => {
    if (token.type === 'number' || token.type === 'const' || token.type === 'var') {
      output.push(token);
      prevType = 'value';
      return;
    }
    if (token.type === 'postfix') {
      output.push(token);
      prevType = 'value';
      return;
    }
    if (token.type === 'func') {
      stack.push(token);
      prevType = 'func';
      return;
    }
    if (token.type === 'op') {
      if (token.value === '(') {
        stack.push(token);
        prevType = '(';
        return;
      }
      if (token.value === ')') {
        while (stack.length && stack[stack.length - 1].value !== '(') {
          output.push(stack.pop());
        }
        if (!stack.length) {
          throw new Error('Mismatched parentheses');
        }
        stack.pop();
        if (stack.length && stack[stack.length - 1].type === 'func') {
          output.push(stack.pop());
        }
        prevType = 'value';
        return;
      }

      let opValue = token.value;
      if (opValue === '-' && (prevType === null || prevType === 'operator' || prevType === '(' || prevType === 'func')) {
        opValue = 'u-';
      }

      while (stack.length) {
        const top = stack[stack.length - 1];
        if (top.type !== 'op' && top.type !== 'func') {
          break;
        }
        if (top.type === 'func') {
          output.push(stack.pop());
          continue;
        }
        const topInfo = operators[top.value];
        const curInfo = operators[opValue];
        if (!topInfo || !curInfo) {
          break;
        }
        if (
          (curInfo.assoc === 'L' && curInfo.prec <= topInfo.prec) ||
          (curInfo.assoc === 'R' && curInfo.prec < topInfo.prec)
        ) {
          output.push(stack.pop());
        } else {
          break;
        }
      }

      stack.push({ type: 'op', value: opValue });
      prevType = 'operator';
    }
  });

  while (stack.length) {
    const item = stack.pop();
    if (item.value === '(' || item.value === ')') {
      throw new Error('Mismatched parentheses');
    }
    output.push(item);
  }

  return output;
}

function factorial(val) {
  if (!Number.isFinite(val) || val < 0 || Math.floor(val) !== val) {
    throw new Error('Invalid factorial');
  }
  let result = 1;
  for (let i = 2; i <= val; i += 1) {
    result *= i;
  }
  return result;
}

function evalRpn(rpn, angleMode, ansValue, variableValue) {
  const stack = [];
  const toRad = (val) => (angleMode === 'DEG' ? (val * Math.PI) / 180 : val);
  const toDeg = (val) => (angleMode === 'DEG' ? (val * 180) / Math.PI : val);
  const constantsMap = getConstantsMap(ansValue);

  rpn.forEach((token) => {
    if (token.type === 'number') {
      stack.push(token.value);
      return;
    }
    if (token.type === 'const') {
      stack.push(constantsMap[token.value]);
      return;
    }
    if (token.type === 'var') {
      stack.push(variableValue ?? 0);
      return;
    }
    if (token.type === 'postfix') {
      const val = stack.pop();
      if (token.value === 'pct') {
        stack.push(val / 100);
        return;
      }
      if (token.value === 'fact') {
        stack.push(factorial(val));
        return;
      }
    }
    if (token.type === 'op') {
      if (token.value === 'u-') {
        const a = stack.pop();
        stack.push(-a);
        return;
      }
      const b = stack.pop();
      const a = stack.pop();
      switch (token.value) {
        case '+':
          stack.push(a + b);
          break;
        case '-':
          stack.push(a - b);
          break;
        case '*':
          stack.push(a * b);
          break;
        case '/':
          stack.push(a / b);
          break;
        case '^':
          stack.push(Math.pow(a, b));
          break;
        case 'mod':
          stack.push(a % b);
          break;
        default:
          throw new Error('Unknown operator');
      }
      return;
    }
    if (token.type === 'func') {
      const val = stack.pop();
      switch (token.value) {
        case 'sin':
          stack.push(Math.sin(toRad(val)));
          break;
        case 'cos':
          stack.push(Math.cos(toRad(val)));
          break;
        case 'tan':
          stack.push(Math.tan(toRad(val)));
          break;
        case 'asin':
          stack.push(toDeg(Math.asin(val)));
          break;
        case 'acos':
          stack.push(toDeg(Math.acos(val)));
          break;
        case 'atan':
          stack.push(toDeg(Math.atan(val)));
          break;
        case 'sinh':
          stack.push(Math.sinh(val));
          break;
        case 'cosh':
          stack.push(Math.cosh(val));
          break;
        case 'tanh':
          stack.push(Math.tanh(val));
          break;
        case 'log':
          stack.push(Math.log10(val));
          break;
        case 'ln':
          stack.push(Math.log(val));
          break;
        case 'sqrt':
          stack.push(Math.sqrt(val));
          break;
        case 'square':
          stack.push(val * val);
          break;
        case 'cube':
          stack.push(val * val * val);
          break;
        case 'pow10':
          stack.push(Math.pow(10, val));
          break;
        case 'exp':
          stack.push(Math.exp(val));
          break;
        case 'abs':
          stack.push(Math.abs(val));
          break;
        case 'recip':
          stack.push(1 / val);
          break;
        default:
          throw new Error('Unknown function');
      }
    }
  });

  if (stack.length !== 1) {
    throw new Error('Invalid expression');
  }

  const result = stack[0];
  if (!Number.isFinite(result)) {
    throw new Error('Invalid result');
  }
  return result;
}

function evaluateExpression(expr, angleMode, ansValue, variableValue) {
  if (!expr || !expr.trim()) {
    return 0;
  }
  const tokens = tokenize(expr, ansValue);
  const rpn = toRpn(tokens);
  return evalRpn(rpn, angleMode, ansValue, variableValue);
}

function parseNumberList(input) {
  return input
    .split(/[,\s]+/)
    .map((val) => Number(val))
    .filter((val) => Number.isFinite(val));
}

function gcd(a, b) {
  let x = Math.abs(a);
  let y = Math.abs(b);
  while (y) {
    const temp = y;
    y = x % y;
    x = temp;
  }
  return x;
}

function reduceFraction(n, d) {
  const divisor = gcd(n, d);
  return [n / divisor, d / divisor];
}

function loanPayment(principal, rate, years) {
  const months = years * 12;
  if (rate === 0) {
    return principal / months;
  }
  const monthlyRate = rate / 12;
  const factor = Math.pow(1 + monthlyRate, months);
  return (principal * (monthlyRate * factor)) / (factor - 1);
}

function attachButtonFeedback(buttons) {
  buttons.forEach((btn) => {
    btn.addEventListener('mousedown', () => btn.classList.add('active'));
    btn.addEventListener('mouseup', () => btn.classList.remove('active'));
    btn.addEventListener('mouseleave', () => btn.classList.remove('active'));
  });
}

function shouldUseUnary(expr) {
  if (!expr) {
    return true;
  }
  const lastChar = expr.slice(-1);
  return '+-*/^('.includes(lastChar) || expr.endsWith('mod');
}

function tryLiveUpdate(state, updateFn) {
  const expr = state.expr;
  if (!expr || !expr.trim()) {
    updateFn('0');
    return;
  }
  try {
    const resultValue = evaluateExpression(expr, sciState.angle, sciState.last);
    updateFn(formatResult(resultValue));
  } catch (error) {
    // Ignore partial/incomplete expressions.
  }
}

function initScientificCalculator() {
  if (!sciExpressionEl || !sciResultEl) {
    return;
  }
  const sciButtons = document.querySelectorAll('.button-grid .btn, .calc-controls .btn');
  attachButtonFeedback([...sciButtons]);

  sciButtons.forEach((btn) => {
    btn.addEventListener('click', () => {
      if (btn.dataset.value) {
        appendToExpression(sciState, btn.dataset.value);
        updateSciDisplay(null);
        tryLiveUpdate(sciState, updateSciDisplay);
      } else if (btn.dataset.op) {
        appendToExpression(sciState, btn.dataset.op);
        updateSciDisplay(null);
        tryLiveUpdate(sciState, updateSciDisplay);
      } else if (btn.dataset.fn) {
        appendToExpression(sciState, `${btn.dataset.fn}(`);
        updateSciDisplay(null);
        tryLiveUpdate(sciState, updateSciDisplay);
      } else if (btn.dataset.const) {
        appendToExpression(sciState, btn.dataset.const);
        updateSciDisplay(null);
        tryLiveUpdate(sciState, updateSciDisplay);
      } else if (btn.dataset.action === 'clear') {
        clearExpression(sciState, updateSciDisplay);
      } else if (btn.dataset.action === 'backspace') {
        backspaceExpression(sciState, updateSciDisplay);
        tryLiveUpdate(sciState, updateSciDisplay);
      } else if (btn.dataset.action === 'equals') {
        handleResult(sciState, updateSciDisplay, true);
      } else if (btn.dataset.action === 'paren') {
        appendToExpression(sciState, btn.dataset.value);
        updateSciDisplay(null);
        tryLiveUpdate(sciState, updateSciDisplay);
      } else if (btn.dataset.action === 'negate') {
        if (shouldUseUnary(sciState.expr)) {
          appendToExpression(sciState, '-');
        } else {
          appendToExpression(sciState, '*-1');
        }
        updateSciDisplay(null);
        tryLiveUpdate(sciState, updateSciDisplay);
      }
    });
  });

  if (toggleAngleBtn) {
    toggleAngleBtn.addEventListener('click', () => {
      sciState.angle = sciState.angle === 'DEG' ? 'RAD' : 'DEG';
      setAngleMode();
    });
  }

  setAngleMode();
  updateSciDisplay('0');
}

function initBasicCalculator() {
  if (!basicExpressionEl || !basicResultEl) {
    return;
  }
  const basicButtons = document.querySelectorAll('.simple-grid .btn');
  attachButtonFeedback([...basicButtons]);

  basicButtons.forEach((btn) => {
    btn.addEventListener('click', () => {
      if (btn.dataset.basic) {
        appendToExpression(basicState, btn.dataset.basic);
        updateBasicDisplay(null);
        tryLiveUpdate(basicState, updateBasicDisplay);
      } else if (btn.dataset.basicOp) {
        appendToExpression(basicState, btn.dataset.basicOp);
        updateBasicDisplay(null);
        tryLiveUpdate(basicState, updateBasicDisplay);
      } else if (btn.dataset.basicAction === 'clear') {
        clearExpression(basicState, updateBasicDisplay);
      } else if (btn.dataset.basicAction === 'equals') {
        handleResult(basicState, updateBasicDisplay);
      }
    });
  });

  updateBasicDisplay('0');
}

function initKeyboardSupport() {
  if (!sciExpressionEl || !sciResultEl) {
    return;
  }
  document.addEventListener('keydown', (event) => {
    const active = document.activeElement;
    if (active && (active.tagName === 'INPUT' || active.tagName === 'TEXTAREA')) {
      return;
    }

    const key = event.key;
    if (/[0-9]/.test(key)) {
      appendToExpression(sciState, key);
      updateSciDisplay(null);
      tryLiveUpdate(sciState, updateSciDisplay);
      return;
    }
    if (['+', '-', '*', '/', '^', '.', '(', ')', '%', '!'].includes(key)) {
      appendToExpression(sciState, key);
      updateSciDisplay(null);
      tryLiveUpdate(sciState, updateSciDisplay);
      return;
    }
    if (key === 'Enter') {
      event.preventDefault();
      handleResult(sciState, updateSciDisplay, true);
      return;
    }
    if (key === 'Backspace') {
      backspaceExpression(sciState, updateSciDisplay);
      tryLiveUpdate(sciState, updateSciDisplay);
      return;
    }
    if (key === 'Delete') {
      clearExpression(sciState, updateSciDisplay);
      return;
    }
    if (/[a-z]/i.test(key)) {
      appendToExpression(sciState, key.toLowerCase());
      updateSciDisplay(null);
      tryLiveUpdate(sciState, updateSciDisplay);
    }
  });
}

function initPercentageCalculator() {
  const valueInput = document.getElementById('pct-value');
  const percentInput = document.getElementById('pct-percent');
  const output = document.getElementById('pct-output');
  const changeOld = document.getElementById('pct-original');
  const changeNew = document.getElementById('pct-new');
  const changeOutput = document.getElementById('pct-change-output');
  const btn1 = document.getElementById('pct-calc');
  const btn2 = document.getElementById('pct-change-calc');

  if (valueInput && percentInput && output && btn1) {
    btn1.addEventListener('click', () => {
      const val = Number(valueInput.value);
      const pct = Number(percentInput.value);
      if (!Number.isFinite(val) || !Number.isFinite(pct)) {
        output.textContent = 'Please enter valid values.';
        return;
      }
      output.textContent = `Result: ${formatResult((val * pct) / 100)}`;
    });
  }

  if (changeOld && changeNew && changeOutput && btn2) {
    btn2.addEventListener('click', () => {
      const oldVal = Number(changeOld.value);
      const newVal = Number(changeNew.value);
      if (!Number.isFinite(oldVal) || !Number.isFinite(newVal) || oldVal === 0) {
        changeOutput.textContent = 'Please enter valid values.';
        return;
      }
      const change = ((newVal - oldVal) / oldVal) * 100;
      changeOutput.textContent = `Change: ${formatResult(change)}%`;
    });
  }
}

function initFractionCalculator() {
  const a = document.getElementById('frac-a');
  const b = document.getElementById('frac-b');
  const c = document.getElementById('frac-c');
  const d = document.getElementById('frac-d');
  const op = document.getElementById('frac-op');
  const output = document.getElementById('frac-output');
  const button = document.getElementById('frac-calc');

  if (!a || !b || !c || !d || !op || !output || !button) {
    return;
  }

  button.addEventListener('click', () => {
    const n1 = Number(a.value);
    const d1 = Number(b.value);
    const n2 = Number(c.value);
    const d2 = Number(d.value);
    if (![n1, d1, n2, d2].every(Number.isFinite) || d1 === 0 || d2 === 0) {
      output.textContent = 'Please enter valid fractions.';
      return;
    }
    let num = 0;
    let den = 1;
    switch (op.value) {
      case 'add':
        num = n1 * d2 + n2 * d1;
        den = d1 * d2;
        break;
      case 'sub':
        num = n1 * d2 - n2 * d1;
        den = d1 * d2;
        break;
      case 'mul':
        num = n1 * n2;
        den = d1 * d2;
        break;
      case 'div':
        num = n1 * d2;
        den = d1 * n2;
        break;
      default:
        break;
    }
    const [rn, rd] = reduceFraction(num, den);
    output.textContent = `Result: ${rn}/${rd} (${formatResult(num / den)})`;
  });
}

function initStandardDeviationCalculator() {
  const valuesInput = document.getElementById('sd-values');
  const typeSelect = document.getElementById('sd-type');
  const output = document.getElementById('sd-output');
  const button = document.getElementById('sd-calc');

  if (!valuesInput || !typeSelect || !output || !button) {
    return;
  }

  button.addEventListener('click', () => {
    const values = parseNumberList(valuesInput.value);
    if (values.length < 2) {
      output.textContent = 'Please enter at least two numbers.';
      return;
    }
    const mean = values.reduce((a, b) => a + b, 0) / values.length;
    const variance = values.reduce((acc, val) => acc + Math.pow(val - mean, 2), 0) /
      (typeSelect.value === 'sample' ? values.length - 1 : values.length);
    output.textContent = `Standard deviation: ${formatResult(Math.sqrt(variance))}`;
  });
}

function initZScoreCalculator() {
  const valueInput = document.getElementById('z-value');
  const meanInput = document.getElementById('z-mean');
  const stdInput = document.getElementById('z-std');
  const output = document.getElementById('z-output');
  const button = document.getElementById('z-calc');

  if (!valueInput || !meanInput || !stdInput || !output || !button) {
    return;
  }

  button.addEventListener('click', () => {
    const x = Number(valueInput.value);
    const mean = Number(meanInput.value);
    const std = Number(stdInput.value);
    if (!Number.isFinite(x) || !Number.isFinite(mean) || !Number.isFinite(std) || std === 0) {
      output.textContent = 'Please enter valid values.';
      return;
    }
    output.textContent = `Z-score: ${formatResult((x - mean) / std)}`;
  });
}

function initProbabilityCalculator() {
  const favInput = document.getElementById('prob-fav');
  const totalInput = document.getElementById('prob-total');
  const output = document.getElementById('prob-output');
  const button = document.getElementById('prob-calc');

  if (!favInput || !totalInput || !output || !button) {
    return;
  }

  button.addEventListener('click', () => {
    const fav = Number(favInput.value);
    const total = Number(totalInput.value);
    if (!Number.isFinite(fav) || !Number.isFinite(total) || total <= 0 || fav < 0) {
      output.textContent = 'Please enter valid values.';
      return;
    }
    const prob = fav / total;
    output.textContent = `Probability: ${formatResult(prob)} (${formatResult(prob * 100)}%)`;
  });
}

function initQuadraticCalculator() {
  const aInput = document.getElementById('quad-a');
  const bInput = document.getElementById('quad-b');
  const cInput = document.getElementById('quad-c');
  const output = document.getElementById('quad-output');
  const button = document.getElementById('quad-calc');

  if (!aInput || !bInput || !cInput || !output || !button) {
    return;
  }

  button.addEventListener('click', () => {
    const a = Number(aInput.value);
    const b = Number(bInput.value);
    const c = Number(cInput.value);
    if (!Number.isFinite(a) || !Number.isFinite(b) || !Number.isFinite(c) || a === 0) {
      output.textContent = 'Please enter valid coefficients.';
      return;
    }
    const disc = b * b - 4 * a * c;
    if (disc < 0) {
      output.textContent = 'No real roots.';
      return;
    }
    const root1 = (-b + Math.sqrt(disc)) / (2 * a);
    const root2 = (-b - Math.sqrt(disc)) / (2 * a);
    output.textContent = `Roots: ${formatResult(root1)}, ${formatResult(root2)}`;
  });
}

function initMatrixCalculator() {
  const ids = ['a11', 'a12', 'a21', 'a22', 'b11', 'b12', 'b21', 'b22'];
  const inputs = ids.map((id) => document.getElementById(`mat-${id}`));
  const op = document.getElementById('mat-op');
  const output = document.getElementById('mat-output');
  const button = document.getElementById('mat-calc');

  if (inputs.some((input) => !input) || !op || !output || !button) {
    return;
  }

  button.addEventListener('click', () => {
    const values = inputs.map((input) => Number(input.value));
    if (values.some((val) => !Number.isFinite(val))) {
      output.textContent = 'Please enter valid matrix values.';
      return;
    }
    const [a11, a12, a21, a22, b11, b12, b21, b22] = values;
    let r11;
    let r12;
    let r21;
    let r22;
    if (op.value === 'add') {
      r11 = a11 + b11;
      r12 = a12 + b12;
      r21 = a21 + b21;
      r22 = a22 + b22;
    } else {
      r11 = a11 * b11 + a12 * b21;
      r12 = a11 * b12 + a12 * b22;
      r21 = a21 * b11 + a22 * b21;
      r22 = a21 * b12 + a22 * b22;
    }
    output.textContent = `Result: [${formatResult(r11)} ${formatResult(r12)}; ${formatResult(r21)} ${formatResult(r22)}]`;
  });
}

function initCalculusCalculator() {
  const fxInput = document.getElementById('calc-fx');
  const xInput = document.getElementById('calc-x');
  const hInput = document.getElementById('calc-h');
  const aInput = document.getElementById('calc-a');
  const bInput = document.getElementById('calc-b');
  const output = document.getElementById('calc-output');
  const derivBtn = document.getElementById('calc-derivative');
  const limitBtn = document.getElementById('calc-limit');
  const integralBtn = document.getElementById('calc-integral');

  if (!fxInput || !xInput || !hInput || !aInput || !bInput || !output || !derivBtn || !limitBtn || !integralBtn) {
    return;
  }

  const evalFx = (x) => evaluateExpression(fxInput.value, sciState.angle, sciState.last, x);
  const updateCalcPreview = () => {
    const expr = fxInput.value;
    updateCalcDisplay(expr, null);
    const xVal = Number(xInput.value);
    if (!expr.trim() || !Number.isFinite(xVal)) {
      updateCalcDisplay(expr, '0');
      return;
    }
    try {
      const result = evalFx(xVal);
      updateCalcDisplay(expr, formatResult(result));
    } catch (err) {
      updateCalcDisplay(expr, 'Error');
    }
  };

  fxInput.addEventListener('input', updateCalcPreview);
  xInput.addEventListener('input', updateCalcPreview);

  const keypadButtons = document.querySelectorAll('[data-calc-value], [data-calc-op], [data-calc-fn], [data-calc-const], [data-calc-action]');
  keypadButtons.forEach((btn) => {
    btn.addEventListener('click', () => {
      if (btn.dataset.calcValue) {
        fxInput.value += btn.dataset.calcValue;
      } else if (btn.dataset.calcOp) {
        fxInput.value += btn.dataset.calcOp;
      } else if (btn.dataset.calcFn) {
        fxInput.value += `${btn.dataset.calcFn}(`;
      } else if (btn.dataset.calcConst) {
        fxInput.value += btn.dataset.calcConst;
      } else if (btn.dataset.calcAction === 'clear') {
        fxInput.value = '';
      } else if (btn.dataset.calcAction === 'backspace') {
        fxInput.value = fxInput.value.slice(0, -1);
      } else if (btn.dataset.calcAction === 'paren') {
        fxInput.value += btn.dataset.calcValue;
      }
      updateCalcPreview();
    });
  });

  updateCalcPreview();

  derivBtn.addEventListener('click', () => {
    const x = Number(xInput.value);
    const h = Number(hInput.value) || 0.001;
    if (!Number.isFinite(x) || !Number.isFinite(h) || h === 0) {
      output.textContent = 'Please enter valid x and step values.';
      return;
    }
    try {
      const deriv = (evalFx(x + h) - evalFx(x - h)) / (2 * h);
      output.textContent = `Derivative: ${formatResult(deriv)}`;
    } catch (err) {
      output.textContent = 'Unable to evaluate derivative.';
    }
  });

  limitBtn.addEventListener('click', () => {
    const x = Number(xInput.value);
    const h = Number(hInput.value) || 0.001;
    if (!Number.isFinite(x) || !Number.isFinite(h) || h === 0) {
      output.textContent = 'Please enter valid x and step values.';
      return;
    }
    try {
      const left = evalFx(x - h);
      const right = evalFx(x + h);
      const limit = (left + right) / 2;
      output.textContent = `Limit: ${formatResult(limit)}`;
    } catch (err) {
      output.textContent = 'Unable to evaluate limit.';
    }
  });

  integralBtn.addEventListener('click', () => {
    const a = Number(aInput.value);
    const b = Number(bInput.value);
    if (!Number.isFinite(a) || !Number.isFinite(b) || a === b) {
      output.textContent = 'Please enter valid bounds.';
      return;
    }
    try {
      const n = 200;
      const h = (b - a) / n;
      let sum = evalFx(a) + evalFx(b);
      for (let i = 1; i < n; i += 1) {
        const x = a + h * i;
        sum += (i % 2 === 0 ? 2 : 4) * evalFx(x);
      }
      const integral = (h / 3) * sum;
      output.textContent = `Integral: ${formatResult(integral)}`;
    } catch (err) {
      output.textContent = 'Unable to evaluate integral.';
    }
  });
}

function initMortgageCalculator() {
  const amount = document.getElementById('mortgage-amount');
  const rate = document.getElementById('mortgage-rate');
  const term = document.getElementById('mortgage-term');
  const output = document.getElementById('mortgage-output');
  const button = document.getElementById('mortgage-calc');

  if (!amount || !rate || !term || !output || !button) {
    return;
  }

  button.addEventListener('click', () => {
    const principal = Number(amount.value);
    const r = Number(rate.value) / 100;
    const years = Number(term.value);
    if (!Number.isFinite(principal) || !Number.isFinite(r) || !Number.isFinite(years) || years <= 0) {
      output.textContent = 'Please enter valid values.';
      return;
    }
    const payment = loanPayment(principal, r, years);
    output.textContent = `Monthly payment: $${payment.toFixed(2)}`;
  });
}

function initLoanPaymentCalculator() {
  const amount = document.getElementById('loanpay-amount');
  const rate = document.getElementById('loanpay-rate');
  const term = document.getElementById('loanpay-term');
  const output = document.getElementById('loanpay-output');
  const button = document.getElementById('loanpay-calc');

  if (!amount || !rate || !term || !output || !button) {
    return;
  }

  button.addEventListener('click', () => {
    const principal = Number(amount.value);
    const r = Number(rate.value) / 100;
    const years = Number(term.value);
    if (!Number.isFinite(principal) || !Number.isFinite(r) || !Number.isFinite(years) || years <= 0) {
      output.textContent = 'Please enter valid values.';
      return;
    }
    const payment = loanPayment(principal, r, years);
    output.textContent = `Monthly payment: $${payment.toFixed(2)}`;
  });
}

function initCarLoanCalculator() {
  const price = document.getElementById('car-price');
  const down = document.getElementById('car-down');
  const rate = document.getElementById('car-rate');
  const term = document.getElementById('car-term');
  const output = document.getElementById('car-output');
  const button = document.getElementById('car-calc');

  if (!price || !down || !rate || !term || !output || !button) {
    return;
  }

  button.addEventListener('click', () => {
    const principal = Number(price.value) - Number(down.value || 0);
    const r = Number(rate.value) / 100;
    const years = Number(term.value);
    if (!Number.isFinite(principal) || !Number.isFinite(r) || !Number.isFinite(years) || years <= 0) {
      output.textContent = 'Please enter valid values.';
      return;
    }
    const payment = loanPayment(principal, r, years);
    output.textContent = `Monthly payment: $${payment.toFixed(2)}`;
  });
}

function initCompoundInterestCalculator() {
  const principalInput = document.getElementById('compound-principal');
  const rateInput = document.getElementById('compound-rate');
  const nInput = document.getElementById('compound-n');
  const yearsInput = document.getElementById('compound-years');
  const output = document.getElementById('compound-output');
  const button = document.getElementById('compound-calc');

  if (!principalInput || !rateInput || !nInput || !yearsInput || !output || !button) {
    return;
  }

  button.addEventListener('click', () => {
    const principal = Number(principalInput.value);
    const rate = Number(rateInput.value) / 100;
    const n = Number(nInput.value);
    const years = Number(yearsInput.value);
    if (!Number.isFinite(principal) || !Number.isFinite(rate) || !Number.isFinite(n) || !Number.isFinite(years)) {
      output.textContent = 'Please enter valid values.';
      return;
    }
    if (n <= 0) {
      output.textContent = 'Compounds per year must be greater than 0.';
      return;
    }
    const future = principal * Math.pow(1 + rate / n, n * years);
    output.textContent = `Future value: $${future.toFixed(2)}`;
  });
}

function initRetirementCalculator() {
  const currentInput = document.getElementById('retire-current');
  const monthlyInput = document.getElementById('retire-monthly');
  const rateInput = document.getElementById('retire-rate');
  const yearsInput = document.getElementById('retire-years');
  const output = document.getElementById('retire-output');
  const button = document.getElementById('retire-calc');

  if (!currentInput || !monthlyInput || !rateInput || !yearsInput || !output || !button) {
    return;
  }

  button.addEventListener('click', () => {
    const current = Number(currentInput.value);
    const monthly = Number(monthlyInput.value);
    const rate = Number(rateInput.value) / 100;
    const years = Number(yearsInput.value);
    if (!Number.isFinite(current) || !Number.isFinite(monthly) || !Number.isFinite(rate) || !Number.isFinite(years)) {
      output.textContent = 'Please enter valid values.';
      return;
    }
    const months = years * 12;
    const monthlyRate = rate / 12;
    if (monthlyRate === 0) {
      const future = current + monthly * months;
      output.textContent = `Estimated savings: $${future.toFixed(2)}`;
      return;
    }
    const growth = Math.pow(1 + monthlyRate, months);
    const future = current * growth + (monthly * (growth - 1)) / monthlyRate;
    output.textContent = `Estimated savings: $${future.toFixed(2)}`;
  });
}

function initSalaryCalculator() {
  const grossInput = document.getElementById('salary-gross');
  const taxInput = document.getElementById('salary-tax');
  const deductInput = document.getElementById('salary-deduct');
  const output = document.getElementById('salary-output');
  const button = document.getElementById('salary-calc');

  if (!grossInput || !taxInput || !deductInput || !output || !button) {
    return;
  }

  button.addEventListener('click', () => {
    const gross = Number(grossInput.value);
    const tax = Number(taxInput.value) / 100;
    const deduct = Number(deductInput.value);
    if (!Number.isFinite(gross) || !Number.isFinite(tax) || !Number.isFinite(deduct)) {
      output.textContent = 'Please enter valid values.';
      return;
    }
    const net = gross - gross * tax - deduct;
    output.textContent = `Estimated take-home: $${net.toFixed(2)} (annual)`;
  });
}

function initTaxCalculator() {
  const amountInput = document.getElementById('tax-amount');
  const rateInput = document.getElementById('tax-rate');
  const output = document.getElementById('tax-output');
  const button = document.getElementById('tax-calc');

  if (!amountInput || !rateInput || !output || !button) {
    return;
  }

  button.addEventListener('click', () => {
    const amount = Number(amountInput.value);
    const rate = Number(rateInput.value) / 100;
    if (!Number.isFinite(amount) || !Number.isFinite(rate)) {
      output.textContent = 'Please enter valid values.';
      return;
    }
    const tax = amount * rate;
    output.textContent = `Tax: $${tax.toFixed(2)} | Total: $${(amount + tax).toFixed(2)}`;
  });
}

function initAmortizationCalculator() {
  const amountInput = document.getElementById('amort-amount');
  const rateInput = document.getElementById('amort-rate');
  const termInput = document.getElementById('amort-term');
  const output = document.getElementById('amort-output');
  const button = document.getElementById('amort-calc');

  if (!amountInput || !rateInput || !termInput || !output || !button) {
    return;
  }

  button.addEventListener('click', () => {
    const principal = Number(amountInput.value);
    const rate = Number(rateInput.value) / 100;
    const years = Number(termInput.value);
    if (!Number.isFinite(principal) || !Number.isFinite(rate) || !Number.isFinite(years)) {
      output.textContent = 'Please enter valid values.';
      return;
    }
    const payment = loanPayment(principal, rate, years);
    const totalPaid = payment * years * 12;
    const interest = totalPaid - principal;
    output.textContent = `Payment: $${payment.toFixed(2)} | Total interest: $${interest.toFixed(2)}`;
  });
}

function initInvestmentCalculator() {
  const costInput = document.getElementById('roi-cost');
  const valueInput = document.getElementById('roi-value');
  const output = document.getElementById('roi-output');
  const button = document.getElementById('roi-calc');

  if (!costInput || !valueInput || !output || !button) {
    return;
  }

  button.addEventListener('click', () => {
    const cost = Number(costInput.value);
    const value = Number(valueInput.value);
    if (!Number.isFinite(cost) || !Number.isFinite(value) || cost === 0) {
      output.textContent = 'Please enter valid values.';
      return;
    }
    const roi = ((value - cost) / cost) * 100;
    output.textContent = `ROI: ${formatResult(roi)}%`;
  });
}

function initBmiCalculator() {
  const heightInput = document.getElementById('bmi-height');
  const weightInput = document.getElementById('bmi-weight');
  const output = document.getElementById('bmi-output');
  const button = document.getElementById('bmi-calc');

  if (!heightInput || !weightInput || !output || !button) {
    return;
  }

  button.addEventListener('click', () => {
    const height = parseFloat(heightInput.value);
    const weight = parseFloat(weightInput.value);
    if (!height || !weight) {
      output.textContent = 'Please enter valid height and weight.';
      return;
    }
    const bmi = weight / Math.pow(height / 100, 2);
    let category = 'Healthy';
    if (bmi < 18.5) {
      category = 'Underweight';
    } else if (bmi < 25) {
      category = 'Healthy';
    } else if (bmi < 30) {
      category = 'Overweight';
    } else {
      category = 'Obese';
    }
    output.textContent = `BMI: ${formatResult(bmi)} (${category})`;
  });
}

function initBmrCalculator() {
  const sex = document.getElementById('bmr-sex');
  const age = document.getElementById('bmr-age');
  const height = document.getElementById('bmr-height');
  const weight = document.getElementById('bmr-weight');
  const activity = document.getElementById('bmr-activity');
  const output = document.getElementById('bmr-output');
  const button = document.getElementById('bmr-calc');

  if (!sex || !age || !height || !weight || !activity || !output || !button) {
    return;
  }

  button.addEventListener('click', () => {
    const a = Number(age.value);
    const h = Number(height.value);
    const w = Number(weight.value);
    const act = Number(activity.value);
    if (!Number.isFinite(a) || !Number.isFinite(h) || !Number.isFinite(w)) {
      output.textContent = 'Please enter valid values.';
      return;
    }
    const base = sex.value === 'male'
      ? 10 * w + 6.25 * h - 5 * a + 5
      : 10 * w + 6.25 * h - 5 * a - 161;
    const tdee = base * act;
    output.textContent = `BMR: ${formatResult(base)} kcal | TDEE: ${formatResult(tdee)} kcal`;
  });
}

function initCalorieCalculator() {
  const sex = document.getElementById('cal-sex');
  const age = document.getElementById('cal-age');
  const height = document.getElementById('cal-height');
  const weight = document.getElementById('cal-weight');
  const activity = document.getElementById('cal-activity');
  const goal = document.getElementById('cal-goal');
  const output = document.getElementById('cal-output');
  const button = document.getElementById('cal-calc');

  if (!sex || !age || !height || !weight || !activity || !goal || !output || !button) {
    return;
  }

  button.addEventListener('click', () => {
    const a = Number(age.value);
    const h = Number(height.value);
    const w = Number(weight.value);
    const act = Number(activity.value);
    if (!Number.isFinite(a) || !Number.isFinite(h) || !Number.isFinite(w)) {
      output.textContent = 'Please enter valid values.';
      return;
    }
    const base = sex.value === 'male'
      ? 10 * w + 6.25 * h - 5 * a + 5
      : 10 * w + 6.25 * h - 5 * a - 161;
    let tdee = base * act;
    if (goal.value === 'lose') {
      tdee -= 500;
    } else if (goal.value === 'gain') {
      tdee += 500;
    }
    output.textContent = `Daily calories: ${formatResult(tdee)} kcal`;
  });
}

function initBodyFatCalculator() {
  const sex = document.getElementById('fat-sex');
  const height = document.getElementById('fat-height');
  const neck = document.getElementById('fat-neck');
  const waist = document.getElementById('fat-waist');
  const hip = document.getElementById('fat-hip');
  const output = document.getElementById('fat-output');
  const button = document.getElementById('fat-calc');

  if (!sex || !height || !neck || !waist || !hip || !output || !button) {
    return;
  }

  button.addEventListener('click', () => {
    const h = Number(height.value);
    const n = Number(neck.value);
    const w = Number(waist.value);
    const hp = Number(hip.value);
    if (!Number.isFinite(h) || !Number.isFinite(n) || !Number.isFinite(w)) {
      output.textContent = 'Please enter valid values.';
      return;
    }
    let bf = 0;
    if (sex.value === 'male') {
      bf = 495 / (1.0324 - 0.19077 * Math.log10(w - n) + 0.15456 * Math.log10(h)) - 450;
    } else {
      if (!Number.isFinite(hp)) {
        output.textContent = 'Please enter hip measurement for females.';
        return;
      }
      bf = 495 / (1.29579 - 0.35004 * Math.log10(w + hp - n) + 0.221 * Math.log10(h)) - 450;
    }
    output.textContent = `Body fat: ${formatResult(bf)}%`;
  });
}

function initIdealWeightCalculator() {
  const sex = document.getElementById('ideal-sex');
  const height = document.getElementById('ideal-height');
  const output = document.getElementById('ideal-output');
  const button = document.getElementById('ideal-calc');

  if (!sex || !height || !output || !button) {
    return;
  }

  button.addEventListener('click', () => {
    const hCm = Number(height.value);
    if (!Number.isFinite(hCm)) {
      output.textContent = 'Please enter valid height.';
      return;
    }
    const hIn = hCm / 2.54;
    const base = sex.value === 'male' ? 50 : 45.5;
    const ideal = base + 2.3 * Math.max(0, hIn - 60);
    output.textContent = `Ideal weight: ${formatResult(ideal)} kg`;
  });
}

function initAgeCalculator() {
  const birth = document.getElementById('age-birth');
  const output = document.getElementById('age-output');
  const button = document.getElementById('age-calc');

  if (!birth || !output || !button) {
    return;
  }

  button.addEventListener('click', () => {
    if (!birth.value) {
      output.textContent = 'Please select a birthdate.';
      return;
    }
    const birthDate = new Date(`${birth.value}T00:00:00Z`);
    const now = new Date();
    let years = now.getUTCFullYear() - birthDate.getUTCFullYear();
    let months = now.getUTCMonth() - birthDate.getUTCMonth();
    let days = now.getUTCDate() - birthDate.getUTCDate();

    if (days < 0) {
      months -= 1;
      const prevMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 0));
      days += prevMonth.getUTCDate();
    }
    if (months < 0) {
      years -= 1;
      months += 12;
    }
    output.textContent = `Age: ${years} years, ${months} months, ${days} days`;
  });
}

function initDateDifferenceCalculator() {
  const startInput = document.getElementById('diff-start');
  const endInput = document.getElementById('diff-end');
  const output = document.getElementById('diff-output');
  const button = document.getElementById('diff-calc');

  if (!startInput || !endInput || !output || !button) {
    return;
  }

  button.addEventListener('click', () => {
    const start = startInput.value;
    const end = endInput.value;
    if (!start || !end) {
      output.textContent = 'Please select both dates.';
      return;
    }
    const startDate = new Date(`${start}T00:00:00Z`);
    const endDate = new Date(`${end}T00:00:00Z`);
    const diff = Math.round((endDate - startDate) / (1000 * 60 * 60 * 24));
    output.textContent = `Total days: ${diff}`;
  });
}

function initTipCalculator() {
  const bill = document.getElementById('tip-bill');
  const percent = document.getElementById('tip-percent');
  const people = document.getElementById('tip-people');
  const output = document.getElementById('tip-output');
  const button = document.getElementById('tip-calc');

  if (!bill || !percent || !people || !output || !button) {
    return;
  }

  button.addEventListener('click', () => {
    const billVal = Number(bill.value);
    const pct = Number(percent.value) / 100;
    const split = Number(people.value);
    if (!Number.isFinite(billVal) || !Number.isFinite(pct) || !Number.isFinite(split) || split <= 0) {
      output.textContent = 'Please enter valid values.';
      return;
    }
    const tip = billVal * pct;
    const total = billVal + tip;
    output.textContent = `Tip: $${tip.toFixed(2)} | Per person: $${(total / split).toFixed(2)}`;
  });
}

function initUnitConverter() {
  const lenValue = document.getElementById('len-value');
  const lenFrom = document.getElementById('len-from');
  const lenTo = document.getElementById('len-to');
  const lenOutput = document.getElementById('len-output');
  const lenButton = document.getElementById('len-calc');

  const wtValue = document.getElementById('wt-value');
  const wtFrom = document.getElementById('wt-from');
  const wtTo = document.getElementById('wt-to');
  const wtOutput = document.getElementById('wt-output');
  const wtButton = document.getElementById('wt-calc');

  const tempValue = document.getElementById('temp-value');
  const tempFrom = document.getElementById('temp-from');
  const tempTo = document.getElementById('temp-to');
  const tempOutput = document.getElementById('temp-output');
  const tempButton = document.getElementById('temp-calc');

  if (lenValue && lenFrom && lenTo && lenOutput && lenButton) {
    const lengthRates = { m: 1, km: 1000, mi: 1609.344, ft: 0.3048 };
    lenButton.addEventListener('click', () => {
      const value = Number(lenValue.value);
      if (!Number.isFinite(value)) {
        lenOutput.textContent = 'Please enter a valid value.';
        return;
      }
      const meters = value * lengthRates[lenFrom.value];
      const converted = meters / lengthRates[lenTo.value];
      lenOutput.textContent = `Result: ${formatResult(converted)}`;
    });
  }

  if (wtValue && wtFrom && wtTo && wtOutput && wtButton) {
    const weightRates = { kg: 1, lb: 0.45359237 };
    wtButton.addEventListener('click', () => {
      const value = Number(wtValue.value);
      if (!Number.isFinite(value)) {
        wtOutput.textContent = 'Please enter a valid value.';
        return;
      }
      const kg = value * weightRates[wtFrom.value];
      const converted = kg / weightRates[wtTo.value];
      wtOutput.textContent = `Result: ${formatResult(converted)}`;
    });
  }

  if (tempValue && tempFrom && tempTo && tempOutput && tempButton) {
    tempButton.addEventListener('click', () => {
      const value = Number(tempValue.value);
      if (!Number.isFinite(value)) {
        tempOutput.textContent = 'Please enter a valid value.';
        return;
      }
      let celsius = value;
      if (tempFrom.value === 'f') {
        celsius = (value - 32) * (5 / 9);
      }
      const converted = tempTo.value === 'f' ? celsius * (9 / 5) + 32 : celsius;
      tempOutput.textContent = `Result: ${formatResult(converted)}`;
    });
  }
}

function initCurrencyCalculator() {
  const amount = document.getElementById('cur-amount');
  const rate = document.getElementById('cur-rate');
  const output = document.getElementById('cur-output');
  const button = document.getElementById('cur-calc');

  if (!amount || !rate || !output || !button) {
    return;
  }

  button.addEventListener('click', () => {
    const amt = Number(amount.value);
    const r = Number(rate.value);
    if (!Number.isFinite(amt) || !Number.isFinite(r)) {
      output.textContent = 'Please enter valid values.';
      return;
    }
    output.textContent = `Converted amount: ${formatResult(amt * r)}`;
  });
}

function initTimeCalculator() {
  const start = document.getElementById('time-start');
  const addHours = document.getElementById('time-add-hours');
  const addMins = document.getElementById('time-add-mins');
  const addOutput = document.getElementById('time-add-output');
  const addButton = document.getElementById('time-add-calc');

  const diffStart = document.getElementById('time-diff-start');
  const diffEnd = document.getElementById('time-diff-end');
  const diffOutput = document.getElementById('time-diff-output');
  const diffButton = document.getElementById('time-diff-calc');

  if (start && addHours && addMins && addOutput && addButton) {
    addButton.addEventListener('click', () => {
      if (!start.value) {
        addOutput.textContent = 'Please select a start time.';
        return;
      }
      const [h, m] = start.value.split(':').map(Number);
      const addH = Number(addHours.value) || 0;
      const addM = Number(addMins.value) || 0;
      let total = h * 60 + m + addH * 60 + addM;
      total = ((total % (24 * 60)) + 24 * 60) % (24 * 60);
      const outH = String(Math.floor(total / 60)).padStart(2, '0');
      const outM = String(total % 60).padStart(2, '0');
      addOutput.textContent = `Result time: ${outH}:${outM}`;
    });
  }

  if (diffStart && diffEnd && diffOutput && diffButton) {
    diffButton.addEventListener('click', () => {
      if (!diffStart.value || !diffEnd.value) {
        diffOutput.textContent = 'Please select both times.';
        return;
      }
      const [sH, sM] = diffStart.value.split(':').map(Number);
      const [eH, eM] = diffEnd.value.split(':').map(Number);
      let diff = (eH * 60 + eM) - (sH * 60 + sM);
      if (diff < 0) {
        diff += 24 * 60;
      }
      const hours = Math.floor(diff / 60);
      const mins = diff % 60;
      diffOutput.textContent = `Difference: ${hours}h ${mins}m`;
    });
  }
}

function initGpaCalculator() {
  const gradesInput = document.getElementById('gpa-grades');
  const creditsInput = document.getElementById('gpa-credits');
  const output = document.getElementById('gpa-output');
  const button = document.getElementById('gpa-calc');

  if (!gradesInput || !creditsInput || !output || !button) {
    return;
  }

  const gradeMap = {
    'A+': 4.0,
    A: 4.0,
    'A-': 3.7,
    'B+': 3.3,
    B: 3.0,
    'B-': 2.7,
    'C+': 2.3,
    C: 2.0,
    'C-': 1.7,
    D: 1.0,
    F: 0
  };

  button.addEventListener('click', () => {
    const grades = gradesInput.value.split(',').map((g) => g.trim().toUpperCase()).filter(Boolean);
    const credits = creditsInput.value.split(',').map((c) => Number(c.trim())).filter((c) => Number.isFinite(c));
    if (grades.length === 0 || grades.length !== credits.length) {
      output.textContent = 'Please enter matching grades and credits.';
      return;
    }
    let totalPoints = 0;
    let totalCredits = 0;
    for (let i = 0; i < grades.length; i += 1) {
      const grade = grades[i];
      const points = gradeMap[grade];
      if (points === undefined) {
        output.textContent = `Unknown grade: ${grade}`;
        return;
      }
      totalPoints += points * credits[i];
      totalCredits += credits[i];
    }
    output.textContent = `GPA: ${formatResult(totalPoints / totalCredits)}`;
  });
}

function initDiscountCalculator() {
  const priceInput = document.getElementById('disc-price');
  const percentInput = document.getElementById('disc-percent');
  const output = document.getElementById('disc-output');
  const button = document.getElementById('disc-calc');

  if (!priceInput || !percentInput || !output || !button) {
    return;
  }

  button.addEventListener('click', () => {
    const price = Number(priceInput.value);
    const pct = Number(percentInput.value) / 100;
    if (!Number.isFinite(price) || !Number.isFinite(pct)) {
      output.textContent = 'Please enter valid values.';
      return;
    }
    const savings = price * pct;
    const final = price - savings;
    output.textContent = `Final price: $${final.toFixed(2)} | Savings: $${savings.toFixed(2)}`;
  });
}

function initRandomCalculator() {
  const minInput = document.getElementById('rand-min');
  const maxInput = document.getElementById('rand-max');
  const output = document.getElementById('rand-output');
  const button = document.getElementById('rand-calc');

  if (!minInput || !maxInput || !output || !button) {
    return;
  }

  button.addEventListener('click', () => {
    const min = Number(minInput.value);
    const max = Number(maxInput.value);
    if (!Number.isFinite(min) || !Number.isFinite(max) || min > max) {
      output.textContent = 'Please enter valid values.';
      return;
    }
    const result = Math.floor(Math.random() * (max - min + 1)) + min;
    output.textContent = `Random number: ${result}`;
  });
}

function initPasswordCalculator() {
  const input = document.getElementById('pw-input');
  const output = document.getElementById('pw-output');
  const button = document.getElementById('pw-calc');

  if (!input || !output || !button) {
    return;
  }

  button.addEventListener('click', () => {
    const val = input.value || '';
    let score = 0;
    if (val.length >= 8) score += 1;
    if (val.length >= 12) score += 1;
    if (/[A-Z]/.test(val)) score += 1;
    if (/[a-z]/.test(val)) score += 1;
    if (/[0-9]/.test(val)) score += 1;
    if (/[^A-Za-z0-9]/.test(val)) score += 1;

    let label = 'Weak';
    if (score >= 5) label = 'Strong';
    else if (score >= 3) label = 'Moderate';

    output.textContent = `Strength: ${label}`;
  });
}

function initHexBinaryCalculator() {
  const input = document.getElementById('hexbin-input');
  const baseSelect = document.getElementById('hexbin-base');
  const output = document.getElementById('hexbin-output');
  const button = document.getElementById('hexbin-calc');

  if (!input || !baseSelect || !output || !button) {
    return;
  }

  button.addEventListener('click', () => {
    const base = Number(baseSelect.value);
    const raw = input.value.trim();
    const value = parseInt(raw, base);
    if (Number.isNaN(value)) {
      output.textContent = 'Please enter a valid value.';
      return;
    }
    output.textContent = `Decimal: ${value} | Hex: ${value.toString(16).toUpperCase()} | Binary: ${value.toString(2)}`;
  });
}

function normalizeScientificExpression(expr) {
  return expr
    .replace(/×/g, '*')
    .replace(/÷/g, '/')
    .replace(/−/g, '-')
    .replace(/π/g, 'pi')
    .replace(/√\(/g, 'sqrt(')
    .replace(/×10\^/g, '*10^')
    .replace(/²/g, '^2')
    .replace(/³/g, '^3')
    .replace(/Ans/g, String(sciState.last));
}

function initScientificVendorPreview() {
  const exprInput = document.getElementById('expression1');
  const liveOutput = document.getElementById('sci-live-result');
  if (!exprInput || !liveOutput) {
    return;
  }

  const update = () => {
    const raw = exprInput.value || '';
    if (!raw.trim()) {
      liveOutput.textContent = '0';
      return;
    }
    try {
      const normalized = normalizeScientificExpression(raw);
      const result = evaluateExpression(normalized, sciState.angle, sciState.last);
      liveOutput.textContent = formatResult(result);
    } catch (err) {
      liveOutput.textContent = 'Error';
    }
  };

  const wrapFn = (name) => {
    const fn = window[name];
    if (typeof fn !== 'function') {
      return;
    }
    window[name] = (...args) => {
      const result = fn.apply(window, args);
      update();
      if (name === 'runtwofunction') {
        const finalValue = Number(exprInput.value);
        if (Number.isFinite(finalValue)) {
          sciState.last = finalValue;
        }
      }
      return result;
    };
  };

  [
    'display1',
    'display2',
    'display3',
    'back',
    'clr',
    'allclr',
    'sinfn',
    'cosfn',
    'tanfn',
    'logfn',
    'lnfn',
    'abs',
    'squareroot',
    'power',
    'square',
    'multiply',
    'percentage',
    'pi',
    'e',
    'exp',
    'answer',
    'factorial',
    'runtwofunction'
  ].forEach(wrapFn);

  document.addEventListener('keydown', () => {
    setTimeout(update, 0);
  });

  update();
}

function initSearch() {
  const search = document.getElementById('site-search');
  if (!search) {
    return;
  }
  const cards = Array.from(document.querySelectorAll('.category-card'));
  const applyFilter = () => {
    const query = search.value.trim().toLowerCase();
    if (cards.length === 0) {
      return;
    }
    cards.forEach((card) => {
      const title = card.querySelector('h3')?.textContent?.toLowerCase() || '';
      const desc = card.querySelector('p')?.textContent?.toLowerCase() || '';
      const match = query === '' || title.includes(query) || desc.includes(query);
      card.classList.toggle('is-hidden', !match);
    });
  };

  if (cards.length === 0) {
    search.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') {
        const query = search.value.trim();
        if (query) {
          window.location.href = `index.html?search=${encodeURIComponent(query)}`;
        }
      }
    });
    return;
  }

  search.addEventListener('input', applyFilter);

  const params = new URLSearchParams(window.location.search);
  const preset = params.get('search');
  if (preset) {
    search.value = preset;
    applyFilter();
  }
}

initScientificCalculator();
initBasicCalculator();
initKeyboardSupport();
initPercentageCalculator();
initFractionCalculator();
initStandardDeviationCalculator();
initZScoreCalculator();
initProbabilityCalculator();
initQuadraticCalculator();
initMatrixCalculator();
initCalculusCalculator();
initMortgageCalculator();
initLoanPaymentCalculator();
initCarLoanCalculator();
initCompoundInterestCalculator();
initRetirementCalculator();
initSalaryCalculator();
initTaxCalculator();
initAmortizationCalculator();
initInvestmentCalculator();
initBmiCalculator();
initBmrCalculator();
initCalorieCalculator();
initBodyFatCalculator();
initIdealWeightCalculator();
initAgeCalculator();
initDateDifferenceCalculator();
initTipCalculator();
initUnitConverter();
initCurrencyCalculator();
initTimeCalculator();
initGpaCalculator();
initDiscountCalculator();
initRandomCalculator();
initPasswordCalculator();
initHexBinaryCalculator();
initSearch();
initScientificVendorPreview();
