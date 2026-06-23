import { expect, test, type APIRequestContext } from '@playwright/test';

type AuthPayload = {
  token: string;
  user: {
    id: string;
    email: string;
    phone?: string | null;
    companyProfileComplete?: boolean;
  };
};

type RagSource = {
  id: string;
  sourceType: string;
  title?: string | null;
  createdByUserId?: string | null;
};

type RagSourceDetail = RagSource & {
  chunks: Array<{
    sourceType: string;
    chunkType: string;
    text: string;
    hasEmbedding: boolean;
  }>;
  jobs: Array<{
    status: string;
    stage?: string | null;
    errorMessage?: string | null;
  }>;
};

const apiBaseURL = process.env.E2E_API_BASE_URL || 'http://127.0.0.1:3101/api';
const password = 'Playwright1!';

function authHeaders(token: string) {
  return { Authorization: `Bearer ${token}` };
}

async function registerUser(request: APIRequestContext, email: string): Promise<AuthPayload> {
  const response = await request.post(`${apiBaseURL}/auth/register`, {
    data: { email, password, phone: '+4915123456789' },
  });
  expect(response.ok(), await response.text()).toBeTruthy();
  return response.json();
}

async function getSources(request: APIRequestContext, token: string, proposalId: string): Promise<RagSource[]> {
  const response = await request.get(`${apiBaseURL}/rag/sources?proposalId=${encodeURIComponent(proposalId)}`, {
    headers: authHeaders(token),
  });
  expect(response.ok(), await response.text()).toBeTruthy();
  return (await response.json()).items;
}

async function getSourceDetail(
  request: APIRequestContext,
  token: string,
  sourceId: string
): Promise<RagSourceDetail> {
  const response = await request.get(`${apiBaseURL}/rag/sources/${sourceId}`, {
    headers: authHeaders(token),
  });
  expect(response.ok(), await response.text()).toBeTruthy();
  return response.json();
}

test('AI intake UI captures draft, chat, and upload into RAG storage', async ({ page, request }, testInfo) => {
  const scenarioKey = `PW-RAG-${Date.now()}-${testInfo.workerIndex}`;
  const email = `e2e-${scenarioKey.toLowerCase()}@example.com`;
  const auth = await registerUser(request, email);
  let proposalId = '';

  await page.addInitScript(({ token, user }) => {
    localStorage.setItem('omran_auth_token', token);
    localStorage.setItem('omran_auth_user', JSON.stringify(user));
    localStorage.setItem('sa_locale', 'en');
    localStorage.setItem('sa_theme', 'light');
  }, auth);

  try {
    await page.goto('/ai-intake');
    await expect(page.getByTestId('ai-intake-create')).toBeVisible();

    const createResponsePromise = page.waitForResponse(
      (response) => response.url().includes('/api/ai/intakes') && response.request().method() === 'POST'
    );
    await page.getByTestId('ai-intake-create').click();
    const created = await (await createResponsePromise).json();
    proposalId = created.id;
    expect(proposalId).toBeTruthy();
    await expect(page.getByTestId('rag-capture-draft')).toBeEnabled();

    await page.getByTestId('proposal-order-title').fill(`${scenarioKey} Dental clinic renovation`);
    await page
      .getByTestId('proposal-summary')
      .fill('Night HVAC work, sterile-zone access controls, and live Siemens fire alarm continuity.');

    const captureResponsePromise = page.waitForResponse(
      (response) =>
        response.url().includes(`/api/ai/intakes/${proposalId}`) && response.request().method() === 'PUT'
    );
    await page.getByTestId('rag-capture-draft').click();
    await expect((await captureResponsePromise).ok()).toBeTruthy();

    await expect
      .poll(async () => {
        const sources = await getSources(request, auth.token, proposalId);
        return sources.some((source) => source.sourceType === 'proposal_snapshot');
      })
      .toBe(true);

    await page
      .getByTestId('ai-chat-input')
      .fill(
        `${scenarioKey}: Customer Orion Klinikum needs HVAC at night, ISO 14644 access awareness, and a 185000 EUR budget.`
      );
    const chatResponsePromise = page.waitForResponse(
      (response) =>
        response.url().includes(`/api/ai/intakes/${proposalId}/messages/stream`) &&
        response.request().method() === 'POST'
    );
    await page.getByTestId('ai-chat-send').click();
    await expect((await chatResponsePromise).ok()).toBeTruthy();
    await expect(page.getByTestId('ai-chat-message-assistant').last()).toContainText('E2E assistant captured');

    const uploadResponsePromise = page.waitForResponse(
      (response) => response.url().includes('/api/rag/sources/upload') && response.request().method() === 'POST'
    );
    await page.getByTestId('rag-file-input').setInputFiles({
      name: `${scenarioKey}-site-note.txt`,
      mimeType: 'text/plain',
      buffer: Buffer.from(
        `${scenarioKey}: Freight elevator deliveries only from 06:00 to 08:00. Siemens fire alarm vendor needs 48 hours notice.`
      ),
    });
    await expect((await uploadResponsePromise).ok()).toBeTruthy();

    await expect
      .poll(async () => {
        const currentSources = await getSources(request, auth.token, proposalId);
        const sourceTypes = new Set(currentSources.map((source) => source.sourceType));
        return ['proposal_snapshot', 'chat_fact', 'uploaded_file'].every((type) => sourceTypes.has(type))
          ? currentSources
          : [];
      })
      .not.toHaveLength(0);

    const finalSources = await getSources(request, auth.token, proposalId);
    expect(finalSources.map((source) => source.sourceType)).toEqual(
      expect.arrayContaining(['proposal_snapshot', 'chat_fact', 'uploaded_file'])
    );
    expect(finalSources.every((source) => source.createdByUserId === auth.user.id)).toBe(true);

    const details = await Promise.all(
      finalSources.map((source) => getSourceDetail(request, auth.token, source.id))
    );
    expect(details.every((source) => source.jobs.every((job) => job.status === 'complete'))).toBe(true);
    expect(details.flatMap((source) => source.chunks).every((chunk) => chunk.hasEmbedding)).toBe(true);

    const queryResponse = await request.post(`${apiBaseURL}/rag/query`, {
      headers: authHeaders(auth.token),
      data: {
        proposalId,
        question: 'What are the HVAC, sterile access, freight, and fire alarm constraints?',
        limit: 8,
      },
    });
    expect(queryResponse.ok(), await queryResponse.text()).toBeTruthy();
    const queryItems = (await queryResponse.json()).items as Array<{ text: string; sourceType: string }>;
    expect(queryItems.length).toBeGreaterThan(0);
    expect(queryItems.map((item) => item.sourceType)).toEqual(
      expect.arrayContaining(['proposal_snapshot', 'chat_fact'])
    );
    expect(queryItems.map((item) => item.text).join('\n')).toContain(scenarioKey);
  } finally {
    if (proposalId) {
      await request.delete(`${apiBaseURL}/ai/intakes/${proposalId}`, {
        headers: authHeaders(auth.token),
      });
    }
  }
});
