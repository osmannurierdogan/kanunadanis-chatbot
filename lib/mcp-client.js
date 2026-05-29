const { Client } = require('@modelcontextprotocol/sdk/client');
const { StreamableHTTPClientTransport } = require('@modelcontextprotocol/sdk/client/streamableHttp.js');

const MCP_URL = process.env.MCP_MEVZUAT_URL || 'https://mevzuat.surucu.dev/mcp';
const TOOLS_TTL_MS = 5 * 60 * 1000;
const FAILURE_BACKOFF_MS = 60 * 1000;
const CONNECT_TIMEOUT_MS = 8000;

let clientPromise = null;
let cachedTools = null;
let cachedAt = 0;
let lastFailureAt = 0;
let lastFailureMessage = '';

function withTimeout(promise, ms, label) {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(`${label} timeout (${ms}ms)`)), ms);
    promise.then((v) => { clearTimeout(t); resolve(v); }, (e) => { clearTimeout(t); reject(e); });
  });
}

async function getClient() {
  if (clientPromise) return clientPromise;
  clientPromise = (async () => {
    const transport = new StreamableHTTPClientTransport(new URL(MCP_URL));
    const client = new Client({ name: 'mevzuat-ai', version: '1.0.0' });
    await withTimeout(client.connect(transport), CONNECT_TIMEOUT_MS, 'MCP connect');
    return client;
  })();
  try {
    return await clientPromise;
  } catch (e) {
    clientPromise = null;
    throw e;
  }
}

async function getAnthropicTools() {
  if (cachedTools && Date.now() - cachedAt < TOOLS_TTL_MS) return cachedTools;

  // Skip retry if we recently failed
  if (lastFailureAt && Date.now() - lastFailureAt < FAILURE_BACKOFF_MS) {
    throw new Error(`MCP unavailable (cached failure): ${lastFailureMessage}`);
  }

  try {
    const client = await getClient();
    const { tools } = await withTimeout(client.listTools(), CONNECT_TIMEOUT_MS, 'MCP listTools');
    cachedTools = tools.map((t) => ({
      name: t.name,
      description: t.description || '',
      input_schema: t.inputSchema || { type: 'object', properties: {} }
    }));
    cachedAt = Date.now();
    lastFailureAt = 0;
    lastFailureMessage = '';
    return cachedTools;
  } catch (e) {
    lastFailureAt = Date.now();
    lastFailureMessage = e.message || String(e);
    throw e;
  }
}

async function callTool(name, args) {
  const client = await getClient();
  return client.callTool({ name, arguments: args || {} });
}

module.exports = { getAnthropicTools, callTool };
