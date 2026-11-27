require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { GoogleGenAI } = require('@google/genai');
const { google } = require('googleapis');

const AGENT_MODELS = {
  po: process.env.PO_MODEL || process.env.GEMINI_MODEL || 'gemini-3.1-flash-lite',
  sm: process.env.SM_MODEL || process.env.GEMINI_MODEL || 'gemini-3.5-flash-lite',
  dev: process.env.DEV_MODEL || process.env.GEMINI_MODEL || 'gemini-3.6-flash',
};

const EXPLORATORY_FAULT_RATE = 0.15;
const ALLOWED_HTTP_STATUSES = [200, 400, 404, 409, 422, 500, 504];
const ALLOWED_BUG_TYPES = ['none', 'race_condition', 'webhook_timeout'];

const CONDITIONS = [
  {
    id: 'PAY-001',
    scenario: 'Standard payment success',
    sabotage: 'none',
    input: 'Valid Pix payment payload with CPF key.',
    expectedStatuses: [200],
  },
  {
    id: 'PAY-002',
    scenario: 'Insufficient account balance',
    sabotage: 'none',
    input: 'Account balance is insufficient for the requested payment amount.',
    expectedStatuses: [422],
  },
  {
    id: 'PAY-003',
    scenario: 'Temporary gateway unavailability',
    sabotage: 'webhook_timeout',
    input: 'Partner webhook timed out during payment notification.',
    expectedStatuses: [500, 504],
  },
  {
    id: 'PAY-004',
    scenario: 'Duplicate or concurrent transaction attempt',
    sabotage: 'race_condition',
    input: 'Simultaneous duplicate transaction attempt under high concurrency.',
    expectedStatuses: [409, 422],
  },
  {
    id: 'PAY-005',
    scenario: 'Invalid Pix key format',
    sabotage: 'none',
    input: 'Payload with malformed Pix CPF key.',
    expectedStatuses: [400, 422],
  },
  {
    id: 'PAY-006',
    scenario: 'Amount below operational minimum',
    sabotage: 'none',
    input: 'Payload with transaction amount less than or equal to zero.',
    expectedStatuses: [422],
  },
  {
    id: 'PAY-007',
    scenario: 'Amount above daily operational limit',
    sabotage: 'none',
    input: 'Payload with transaction amount exceeding the daily Pix limit.',
    expectedStatuses: [422],
  },
  {
    id: 'PAY-008',
    scenario: 'Incomplete request payload',
    sabotage: 'none',
    input: 'Payload missing mandatory request fields.',
    expectedStatuses: [400],
  },
  {
    id: 'PAY-009',
    scenario: 'Retry with the same idempotency key',
    sabotage: 'none',
    input: 'Repeated payload carrying the exact same Idempotency-Key.',
    expectedStatuses: [200, 409],
  },
  {
    id: 'PAY-010',
    scenario: 'Refund or reversal flow',
    sabotage: 'none',
    input: 'Post-settlement refund/reversal request for a processed payment.',
    expectedStatuses: [200],
  },
  {
    id: 'PAY-011',
    scenario: 'Pix key not registered in DICT',
    sabotage: 'none',
    input: 'Payload with syntactically valid CPF key not found in DICT.',
    expectedStatuses: [404, 422],
  },
];

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function evaluatePoOracle(rawText) {
  const issues = [];
  let parsed = null;

  try {
    parsed = JSON.parse(rawText);
  } catch (err) {
    issues.push(`Invalid JSON from Pênfredo (PO): ${err.message}`);
    return { passed: false, issues, parsed: null };
  }

  if (!isPlainObject(parsed)) {
    issues.push('PO output must be a JSON object.');
    return { passed: false, issues, parsed };
  }

  if (typeof parsed.feature !== 'string' || parsed.feature.trim() === '') {
    issues.push('Missing or empty "feature" string.');
  }

  if (
    !Array.isArray(parsed.business_rules) ||
    parsed.business_rules.length === 0 ||
    parsed.business_rules.some((r) => typeof r !== 'string' || r.trim() === '')
  ) {
    issues.push('Missing or empty "business_rules" array.');
  }

  const requiredCriteria = [
    'success',
    'insufficient_funds',
    'gateway_timeout',
    'duplicate_transaction',
  ];

  if (!isPlainObject(parsed.acceptance_criteria)) {
    issues.push('Missing "acceptance_criteria" object.');
  } else {
    for (const key of requiredCriteria) {
      const val = parsed.acceptance_criteria[key];
      if (typeof val !== 'string' || val.trim() === '') {
        issues.push(`Missing or empty acceptance_criteria.${key}.`);
      }
    }
  }

  return { passed: issues.length === 0, issues, parsed };
}

function evaluateSmOracle(rawText) {
  const issues = [];
  let parsed = null;

  try {
    parsed = JSON.parse(rawText);
  } catch (err) {
    issues.push(`Invalid JSON from Dino (SM): ${err.message}`);
    return { passed: false, issues, parsed: null };
  }

  if (!isPlainObject(parsed)) {
    issues.push('SM output must be a JSON object.');
    return { passed: false, issues, parsed };
  }

  if (typeof parsed.sprint_id !== 'string' || parsed.sprint_id.trim() === '') {
    issues.push('Missing or empty "sprint_id" string.');
  }

  if (
    !Array.isArray(parsed.impacted_endpoints) ||
    parsed.impacted_endpoints.length === 0 ||
    !parsed.impacted_endpoints.includes('POST /v1/payments')
  ) {
    issues.push('impacted_endpoints must include "POST /v1/payments".');
  }

  if (!isPlainObject(parsed.sample_payload_success)) {
    issues.push('Missing "sample_payload_success" object.');
  } else {
    const { payment_method: method, amount } = parsed.sample_payload_success;
    if (typeof method !== 'string' || method.trim() === '') {
      issues.push('sample_payload_success.payment_method must be a non-empty string.');
    }
    if (typeof amount !== 'number' || Number.isNaN(amount) || amount <= 0) {
      issues.push('sample_payload_success.amount must be a positive number (> 0).');
    }
  }

  if (!isPlainObject(parsed.sample_payload_error)) {
    issues.push('Missing "sample_payload_error" object.');
  }

  return { passed: issues.length === 0, issues, parsed };
}

function evaluateDevOracle(rawText, condition) {
  const issues = [];
  let parsed = null;

  try {
    parsed = JSON.parse(rawText);
  } catch (err) {
    issues.push(`Invalid JSON from Ênio (Dev): ${err.message}`);
    return { passed: false, issues, parsed: null };
  }

  if (!isPlainObject(parsed)) {
    issues.push('Dev output must be a JSON object.');
    return { passed: false, issues, parsed };
  }

  if (!ALLOWED_HTTP_STATUSES.includes(parsed.request_status)) {
    issues.push(
      `Invalid request_status (${parsed.request_status}). Allowed: ${ALLOWED_HTTP_STATUSES.join(', ')}.`
    );
  }

  if (typeof parsed.bug_triggered !== 'boolean') {
    issues.push('bug_triggered must be a boolean.');
  }

  if (!ALLOWED_BUG_TYPES.includes(parsed.bug_type)) {
    issues.push(
      `Invalid bug_type (${parsed.bug_type}). Allowed: ${ALLOWED_BUG_TYPES.join(', ')}.`
    );
  }

  if (parsed.bug_triggered === false && parsed.bug_type !== 'none') {
    issues.push('bug_type must be "none" when bug_triggered is false.');
  }

  if (parsed.bug_triggered === true && parsed.bug_type === 'none') {
    issues.push('bug_type cannot be "none" when bug_triggered is true.');
  }

  if (
    !isPlainObject(parsed.response_mock) ||
    typeof parsed.response_mock.message !== 'string' ||
    parsed.response_mock.message.trim() === ''
  ) {
    issues.push('Missing response_mock.message string.');
  }

  if (condition) {
    if (!condition.expectedStatuses.includes(parsed.request_status)) {
      issues.push(
        `Status mismatch: expected HTTP ${condition.expectedStatuses.join(' or ')}, got ${parsed.request_status}.`
      );
    }
  } else if (parsed.bug_triggered === true) {
    issues.push(
      `Exploratory fault detected in Dev simulation: ${parsed.bug_type} (HTTP ${parsed.request_status}).`
    );
  }

  return { passed: issues.length === 0, issues, parsed };
}

async function saveToSheets(testReport) {
  try {
    const credentialsPath = path.join(__dirname, 'credentials.json');
    if (!fs.existsSync(credentialsPath)) {
      console.error('❌ [Sheets] Missing credentials.json in project root.');
      return;
    }

    const spreadsheetId = process.env.GOOGLE_SHEETS_SPREADSHEET_ID;
    if (!spreadsheetId) {
      console.error('❌ [Sheets] GOOGLE_SHEETS_SPREADSHEET_ID not found in .env.');
      return;
    }

    const auth = new google.auth.GoogleAuth({
      keyFile: credentialsPath,
      scopes: ['https://www.googleapis.com/auth/spreadsheets'],
    });

    const sheets = google.sheets({ version: 'v4', auth });

    const values = [
      [
        testReport.timestamp,
        testReport.sprintId,
        testReport.feature,
        testReport.bugTriggered ? 'Yes' : 'No',
        testReport.bugType,
        testReport.httpStatus,
        testReport.message,
      ],
    ];

    await sheets.spreadsheets.values.append({
      spreadsheetId,
      range: 'A:G',
      valueInputOption: 'USER_ENTERED',
      resource: { values },
    });

    console.log('📊 [Sheets] Test execution saved to spreadsheet successfully!');
  } catch (error) {
    console.error('❌ [Sheets] Failed to save execution data:', error.message);
  }
}

function saveEvidenceReport(runResults, targetLabel) {
  if (runResults.length === 0) return;

  const evidenceDir = path.join(__dirname, 'docs', 'evidence');
  fs.mkdirSync(evidenceDir, { recursive: true });

  const fileTimestamp = new Date().toISOString().slice(0, 19).replace(/:/g, '-');
  const safeTarget = targetLabel.replace(/[^a-zA-Z0-9._-]/g, '_');
  const filename = `run-${fileTimestamp}_${safeTarget}.md`;
  const filePath = path.join(evidenceDir, filename);

  const lines = [];
  lines.push(`# Lab Gréias — Execution & Oracle Evidence Report`);
  lines.push('');
  lines.push(`- **Generated at:** ${new Date().toISOString()}`);
  lines.push(
    `- **Models:** Pênfredo=\`${AGENT_MODELS.po}\` | Dino=\`${AGENT_MODELS.sm}\` | Ênio=\`${AGENT_MODELS.dev}\``
  );
  lines.push(`- **Target:** \`${targetLabel}\``);
  lines.push(`- **Total runs:** ${runResults.length}`);
  lines.push('');
  lines.push('## Summary');
  lines.push('');
  lines.push(
    '| Run | Case / Mode | Expected HTTP | Observed HTTP | Pênfredo (PO) | Dino (SM) | Ênio (Dev) | Oracle Verdict |'
  );
  lines.push('| --- | --- | --- | --- | --- | --- | --- | --- |');

  runResults.forEach((item, idx) => {
    const expected = item.expectedStatuses ? item.expectedStatuses.join(' / ') : '200 (free)';
    const observed = item.observedStatus ?? 'ERR';
    const poStatus = item.poOracle?.passed ? 'PASS' : 'MISMATCH';
    const smStatus = item.smOracle?.passed ? 'PASS' : 'MISMATCH';
    const devStatus = item.devOracle?.passed ? 'PASS' : 'MISMATCH';
    lines.push(
      `| ${idx + 1} | \`${item.caseId}\` | ${expected} | ${observed} | ${poStatus} | ${smStatus} | ${devStatus} | **${item.verdict}** |`
    );
  });

  lines.push('');

  runResults.forEach((item, idx) => {
    lines.push(`---`);
    lines.push('');
    lines.push(`## Run ${idx + 1}: \`${item.caseId}\` (${item.mode})`);
    lines.push('');
    lines.push(`- **Timestamp:** ${item.timestamp}`);
    lines.push(`- **Oracle Verdict:** **${item.verdict}**`);

    if (item.error) {
      lines.push(`- **Runtime Error:** \`${item.error}\``);
      lines.push('');
      return;
    }

    lines.push(
      `- **Exploratory Fault Rolls:** PO=${item.faultRolls.po ? 'ENABLED' : 'DISABLED'}, SM=${item.faultRolls.sm ? 'ENABLED' : 'DISABLED'}, Dev=${item.faultRolls.dev}`
    );
    lines.push('');

    const allIssues = [
      ...(item.poOracle?.issues || []).map((i) => `[Pênfredo PO] ${i}`),
      ...(item.smOracle?.issues || []).map((i) => `[Dino SM] ${i}`),
      ...(item.devOracle?.issues || []).map((i) => `[Ênio Dev] ${i}`),
    ];

    if (allIssues.length > 0) {
      lines.push('### Oracle Findings');
      lines.push('');
      allIssues.forEach((issue) => lines.push(`- ${issue}`));
      lines.push('');
    }

    lines.push('### Agent Payloads');
    lines.push('');
    lines.push('**Pênfredo (PO):**');
    lines.push('```json');
    lines.push(item.rawOutputs.po || '');
    lines.push('```');
    lines.push('');
    lines.push('**Dino (SM):**');
    lines.push('```json');
    lines.push(item.rawOutputs.sm || '');
    lines.push('```');
    lines.push('');
    lines.push('**Ênio (Dev):**');
    lines.push('```json');
    lines.push(item.rawOutputs.dev || '');
    lines.push('```');
    lines.push('');
  });

  fs.writeFileSync(filePath, lines.join('\n'), 'utf8');
  console.log(`📝 [Evidence] Report saved to docs/evidence/${filename}`);
}

async function runAgents(condition) {
  const timestamp = new Date().toLocaleString('en-US', {
    timeZone: 'America/Sao_Paulo',
  });
  const isExploratory = !condition;
  const caseId = condition ? condition.id : 'EXPLORATORY';

  const faultRolls = isExploratory
    ? {
        po: Math.random() < EXPLORATORY_FAULT_RATE,
        sm: Math.random() < EXPLORATORY_FAULT_RATE,
        dev:
          Math.random() < EXPLORATORY_FAULT_RATE
            ? Math.random() < 0.5
              ? 'race_condition'
              : 'webhook_timeout'
            : 'none',
      }
    : { po: false, sm: false, dev: 'none' };

  const poFaultDirective = `\n\nFAULT_INJECTION: ${faultRolls.po ? 'ENABLED' : 'DISABLED'}`;
  const smFaultDirective = `\n\nFAULT_INJECTION: ${faultRolls.sm ? 'ENABLED' : 'DISABLED'}`;

  const devDirective = condition
    ? `\n\nTEST SCENARIO ${condition.id}: ${condition.scenario}.\nInput: ${condition.input}\nSabotage: ${
        condition.sabotage === 'none'
          ? 'DISABLED (bug_triggered=false, bug_type="none")'
          : `ENABLED (bug_triggered=true, bug_type="${condition.sabotage}")`
      }.`
    : `\n\nFAULT_INJECTION: ${
        faultRolls.dev === 'none' ? 'DISABLED' : `ENABLED (type="${faultRolls.dev}")`
      }`;

  try {
    console.log(
      `🤖 Connecting via official Gemini SDK (PO: ${AGENT_MODELS.po} | SM: ${AGENT_MODELS.sm} | Dev: ${AGENT_MODELS.dev})...`
    );

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      console.error('❌ Error: GEMINI_API_KEY not found in .env file.');
      return {
        caseId,
        mode: isExploratory ? 'exploratory' : 'deterministic',
        timestamp,
        expectedStatuses: condition ? condition.expectedStatuses : null,
        observedStatus: null,
        verdict: 'ERROR',
        error: 'GEMINI_API_KEY not found in .env file.',
      };
    }

    const ai = new GoogleGenAI({ apiKey });

    console.log('📂 Loading agent system prompts...');
    const promptPenfredo = fs.readFileSync(
      path.join(__dirname, 'prompts', 'penfredo_po.txt'),
      'utf8'
    );
    const promptDino = fs.readFileSync(
      path.join(__dirname, 'prompts', 'dino_sm.txt'),
      'utf8'
    );
    const promptEnio = fs.readFileSync(
      path.join(__dirname, 'prompts', 'enio_dev.txt'),
      'utf8'
    );

    // 1. Flow 1: Pênfredo (PO)
    console.log(`\n[Flow 1] Requesting specifications from Pênfredo (PO) [${AGENT_MODELS.po}]...`);
    const poResponse = await ai.models.generateContent({
      model: AGENT_MODELS.po,
      contents: `Define the requirements for instant Pix payments using a CPF key.${poFaultDirective}`,
      config: {
        systemInstruction: promptPenfredo,
        responseMimeType: 'application/json',
      },
    });
    const poText = poResponse.text;
    const poOracle = evaluatePoOracle(poText);

    // 2. Flow 2: Dino (SM)
    console.log(`\n[Flow 2] Sending PO specs to Dino (SM) for sprint planning [${AGENT_MODELS.sm}]...`);
    const smResponse = await ai.models.generateContent({
      model: AGENT_MODELS.sm,
      contents: `Based on the PO requirements JSON below, plan the sprint and generate test payloads:\n\n${poText}${smFaultDirective}`,
      config: {
        systemInstruction: promptDino,
        responseMimeType: 'application/json',
      },
    });
    const smText = smResponse.text;
    const smOracle = evaluateSmOracle(smText);

    const sprintId = smOracle.parsed?.sprint_id || 'GREIAS-LAB-S01';

    // 3. Flow 3: Ênio (Dev)
    console.log(`\n[Flow 3] Sending sprint plan to Ênio (Dev) for endpoint simulation [${AGENT_MODELS.dev}]...`);
    const devResponse = await ai.models.generateContent({
      model: AGENT_MODELS.dev,
      contents: `Based on the SM sprint plan below, simulate the endpoint behavior:\n\n${smText}${devDirective}`,
      config: {
        systemInstruction: promptEnio,
        responseMimeType: 'application/json',
      },
    });
    const devText = devResponse.text;
    console.log('\n💬 Response from Ênio (Dev):\n', devText);

    const devOracle = evaluateDevOracle(devText, condition);
    const allPassed = poOracle.passed && smOracle.passed && devOracle.passed;
    const verdict = allPassed ? 'PASS' : 'MISMATCH';

    console.log('\n🔎 [Test Oracle Summary]');
    console.log(` Pênfredo (PO): ${poOracle.passed ? 'PASS' : `MISMATCH -> ${poOracle.issues.join(' | ')}`}`);
    console.log(` Dino (SM): ${smOracle.passed ? 'PASS' : `MISMATCH -> ${smOracle.issues.join(' | ')}`}`);
    console.log(` Ênio (Dev): ${devOracle.passed ? 'PASS' : `MISMATCH -> ${devOracle.issues.join(' | ')}`}`);
    console.log(` Overall: ${verdict}`);

    const devJson = devOracle.parsed;
    const testReport = {
      timestamp,
      sprintId,
      feature: condition
        ? `${condition.id} | Pix Payment via CPF`
        : 'EXPLORATORY | Pix Payment via CPF',
      bugTriggered: Boolean(devJson?.bug_triggered),
      bugType: devJson?.bug_type || 'none',
      httpStatus: devJson?.request_status ?? 500,
      message: devJson?.response_mock?.message || 'Invalid or empty Dev payload',
    };

    await saveToSheets(testReport);

    return {
      caseId,
      mode: isExploratory ? 'exploratory' : 'deterministic',
      timestamp,
      expectedStatuses: condition ? condition.expectedStatuses : null,
      observedStatus: devJson?.request_status ?? null,
      verdict,
      faultRolls,
      poOracle,
      smOracle,
      devOracle,
      rawOutputs: {
        po: poText,
        sm: smText,
        dev: devText,
      },
    };
  } catch (error) {
    console.error('❌ Error executing Lab Gréias pipeline:', error.message);
    return {
      caseId,
      mode: isExploratory ? 'exploratory' : 'deterministic',
      timestamp,
      expectedStatuses: condition ? condition.expectedStatuses : null,
      observedStatus: null,
      verdict: 'ERROR',
      error: error.message,
    };
  }
}

function resolveConditions(targetArg) {
  const normalized = targetArg.trim().toUpperCase();
  if (normalized === 'ALL') {
    return CONDITIONS;
  }

  const selected = [];
  const seen = new Set();
  const tokens = normalized.split(',').map((t) => t.trim()).filter(Boolean);

  for (const token of tokens) {
    if (token.includes('..')) {
      const [startId, endId] = token.split('..').map((s) => s.trim());
      const startIndex = CONDITIONS.findIndex((c) => c.id === startId);
      const endIndex = CONDITIONS.findIndex((c) => c.id === endId);

      if (startIndex === -1 || endIndex === -1 || startIndex > endIndex) {
        return null;
      }

      for (let i = startIndex; i <= endIndex; i++) {
        if (!seen.has(CONDITIONS[i].id)) {
          seen.add(CONDITIONS[i].id);
          selected.push(CONDITIONS[i]);
        }
      }
    } else {
      const match = CONDITIONS.find((c) => c.id === token);
      if (!match) {
        return null;
      }
      if (!seen.has(match.id)) {
        seen.add(match.id);
        selected.push(match);
      }
    }
  }

  return selected.length > 0 ? selected : null;
}

async function runSuite() {
  const target = process.argv[2];
  const parsedInterval = Number.parseInt(process.argv[3], 10);
  const intervalSec =
    Number.isNaN(parsedInterval) || parsedInterval < 0 ? 60 : parsedInterval;

  if (!target) {
    console.log('\n========== [EXPLORATORY MODE] ==========');
    const result = await runAgents(null);
    saveEvidenceReport([result], 'exploratory');
    console.log('\n✅ Exploratory run finished.');
    return;
  }

  const list = resolveConditions(target);

  if (!list) {
    console.error(
      `❌ Invalid target "${target}". Use a single ID (PAY-005), a range (PAY-006..PAY-011), a list (PAY-004,PAY-006), or "all".`
    );
    return;
  }

  const results = [];
  for (let i = 0; i < list.length; i++) {
    console.log(`\n========== [${list[i].id}] run ${i + 1}/${list.length} ==========`);
    const result = await runAgents(list[i]);
    results.push(result);

    if (i < list.length - 1) {
      console.log(`⏳ Waiting ${intervalSec}s before next scenario...`);
      await sleep(intervalSec * 1000);
    }
  }

  saveEvidenceReport(results, target);
  console.log('\n✅ Suite execution finished.');
}

runSuite();