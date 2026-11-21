import http from 'node:http';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

const TIMEOUT_MS = 30000;
const globalTimeout = setTimeout(() => {
    console.error('FAIL: Global timeout reached (30s)');
    process.exit(1);
}, TIMEOUT_MS);
globalTimeout.unref();

const mimeTypes = {
    '.html': 'text/html',
    '.js': 'application/javascript',
    '.css': 'text/css',
    '.json': 'application/json',
    '.ico': 'image/x-icon',
    '.png': 'image/png',
    '.jpg': 'image/jpeg'
};

const server = http.createServer((req, res) => {
    const safePath = path.normalize(req.url).replace(/^(\.\.[\/\\])+/, '');
    const filePath = path.join(import.meta.dirname, safePath === '/' ? 'index.html' : safePath);
    if (!filePath.startsWith(import.meta.dirname)) {
        res.writeHead(403);
        res.end('Forbidden');
        return;
    }
    fs.stat(filePath, (err, stats) => {
        if (err || !stats.isFile()) {
            res.writeHead(404, { 'Content-Type': 'text/plain' });
            res.end('Not Found');
            return;
        }
        const ext = path.extname(filePath);
        res.writeHead(200, { 'Content-Type': mimeTypes[ext] || 'application/octet-stream' });
        fs.createReadStream(filePath).pipe(res);
    });
});

await new Promise((resolve) => server.listen(0, resolve));
const serverPort = server.address().port;

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'chrome-headless-'));
const chromeProcess = spawn('/usr/bin/google-chrome', [
    '--headless=new',
    '--no-sandbox',
    '--disable-gpu',
    '--remote-debugging-port=0',
    `--user-data-dir=${tmpDir}`,
    '--window-size=390,844',
    'about:blank'
], { stdio: ['ignore', 'ignore', 'pipe'] });

let devToolsPort = null;
let stderrData = '';

const wsUrlPromise = new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Chrome startup timeout')), 10000);
    chromeProcess.stderr.on('data', async (chunk) => {
        stderrData += chunk.toString();
        const match = stderrData.match(/DevTools listening on (ws:\/\/127\.0\.0\.1:(\d+)\/devtools\/browser\/[^\s]+)/);
        if (match) {
            clearTimeout(timer);
            devToolsPort = match[2];
            try {
                let pageTarget;
                for (let i = 0; i < 50 && !pageTarget; i++) {
                    const response = await fetch(`http://127.0.0.1:${devToolsPort}/json/list`);
                    const targets = await response.json();
                    pageTarget = targets.find(t => t.type === 'page');
                    if (!pageTarget) await new Promise(r => setTimeout(r, 100));
                }
                if (pageTarget && pageTarget.webSocketDebuggerUrl) {
                    resolve(pageTarget.webSocketDebuggerUrl);
                } else {
                    reject(new Error('No page target found in /json/list'));
                }
            } catch (err) {
                reject(err);
            }
        }
    });
});

let wsUrl;
try {
    wsUrl = await wsUrlPromise;
} catch (err) {
    console.error('FAIL: Setup error:', err.message);
    server.close();
    fs.rmSync(tmpDir, { recursive: true, force: true });
    process.exit(1);
}

const ws = new WebSocket(wsUrl);
let msgId = 1;
const callbacks = new Map();
let loadResolve = null;
const consoleErrors = [];
const exceptions = [];

ws.addEventListener('message', (event) => {
    const msg = JSON.parse(event.data);
    if (msg.id && callbacks.has(msg.id)) {
        const { resolve, reject } = callbacks.get(msg.id);
        callbacks.delete(msg.id);
        if (msg.error) reject(new Error(msg.error.message));
        else resolve(msg.result);
    }
    if (msg.method === 'Page.loadEventFired') {
        if (loadResolve) loadResolve();
    }
    if (msg.method) {
        if (msg.method === 'Runtime.consoleAPICalled' && msg.params.type === 'error') {
            const text = (msg.params.args || []).map(arg => arg.value || arg.description || '').join(' ');
            if (!text.includes('favicon.ico')) consoleErrors.push(text);
        }
        if (msg.method === 'Runtime.exceptionThrown') {
            const text = msg.params.exceptionDetails.text || msg.params.exceptionDetails.exception?.description || 'Unknown exception';
            exceptions.push(text);
        }
        if (msg.method === 'Log.entryAdded' && msg.params.entry.level === 'error') {
            const text = msg.params.entry.text;
            if (!text.includes('favicon.ico')) consoleErrors.push(text);
        }
    }
});

const sendCdp = (method, params = {}) => {
    return new Promise((resolve, reject) => {
        const id = msgId++;
        callbacks.set(id, { resolve, reject });
        ws.send(JSON.stringify({ id, method, params }));
    });
};

await new Promise((resolve, reject) => {
    if (ws.readyState === WebSocket.OPEN) resolve();
    else {
        ws.addEventListener('open', resolve, { once: true });
        ws.addEventListener('error', reject, { once: true });
    }
});

await sendCdp('Runtime.enable');
await sendCdp('Log.enable');
await sendCdp('Page.enable');

const loadPromise = new Promise(resolve => { loadResolve = resolve; });
await sendCdp('Page.navigate', { url: `http://127.0.0.1:${serverPort}/hub-test-v2.html` });
await loadPromise;
await new Promise(r => setTimeout(r, 1500));

const evalResult = await sendCdp('Runtime.evaluate', {
    expression: `
        (async () => {
            const results = [];
            const check = (name, condition) => {
                results.push({ name, passed: !!condition });
            };

            check('window.Corruption exists', typeof window.Corruption !== 'undefined');

            const gaugeVal = document.getElementById('gaugeVal');
            const initialGauge = gaugeVal ? parseInt(gaugeVal.innerText, 10) : NaN;
            check('gaugeVal exists and is numeric', !isNaN(initialGauge));

            const tierLabel = document.getElementById('tierLabel');
            const initialTier = tierLabel ? tierLabel.innerText : '';

            const itemsContainer = document.getElementById('itemsContainer');
            const itemButtons = itemsContainer ? itemsContainer.querySelectorAll('button') : [];
            check('itemsContainer has at least 2 buttons', itemButtons.length >= 2);

            if (itemButtons.length >= 2) {
                itemButtons[0].click();
                itemButtons[1].click();
            }

            const newGauge = gaugeVal ? parseInt(gaugeVal.innerText, 10) : NaN;
            check('gaugeVal increased', newGauge > initialGauge);

            const newTier = tierLabel ? tierLabel.innerText : '';
            check('tierLabel changed', newTier !== initialTier);

            const npcsContainer = document.getElementById('npcsContainer');
            const npcButtons = npcsContainer ? npcsContainer.querySelectorAll('button') : [];
            check('npcsContainer contains 5 buttons', npcButtons.length === 5);

            const logBox = document.getElementById('logBox');
            const initialLogLen = logBox ? logBox.innerText.length : 0;
            if (npcButtons.length > 0) {
                npcButtons[0].click();
            }
            const newLogLen = logBox ? logBox.innerText.length : 0;
            check('logBox grew after clicking 1st NPC', newLogLen > initialLogLen);

            const clickBtn = (id) => {
                const el = document.getElementById(id);
                if (el) el.click();
                return !!el;
            };

            check('tickBtn clickable', clickBtn('tickBtn'));
            check('clinicBtn clickable', clickBtn('clinicBtn'));
            check('healerBtn clickable', clickBtn('healerBtn'));
            check('saveBtn clickable', clickBtn('saveBtn'));

            check('Corruption.getMarkOverlays is function', typeof window.Corruption?.getMarkOverlays === 'function');

            return results;
        })()
    `,
    returnByValue: true,
    awaitPromise: true
});

const testResults = evalResult.result.value || [];
let allPassed = true;

for (const t of testResults) {
    if (t.passed) {
        console.log(`PASS: ${t.name}`);
    } else {
        console.log(`FAIL: ${t.name}`);
        allPassed = false;
    }
}

if (consoleErrors.length > 0 || exceptions.length > 0) {
    console.log(`FAIL: Console errors/exceptions detected: ${consoleErrors.length + exceptions.length}`);
    for (const err of consoleErrors) console.log(`  [Console Error] ${err}`);
    for (const ex of exceptions) console.log(`  [Exception] ${ex}`);
    allPassed = false;
} else {
    console.log('PASS: Zero console errors');
}

ws.close();
chromeProcess.kill();
server.close();
try {
    fs.rmSync(tmpDir, { recursive: true, force: true });
} catch {}

clearTimeout(globalTimeout);
process.exit(allPassed ? 0 : 1);
