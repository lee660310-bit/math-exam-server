require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const multer = require('multer');
const fetch = require('node-fetch');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(helmet({ contentSecurityPolicy: false }));
app.use(cors());
app.use(express.json({ limit: '20mb' }));
app.use(express.urlencoded({ extended: true, limit: '20mb' }));

const limiter = rateLimit({
  windowMs: 60 * 1000,
  max: 30,
  message: { error: '요청이 너무 많습니다. 잠시 후 다시 시도해주세요.' },
  standardHeaders: true,
  legacyHeaders: false,
});
app.use('/api/', limiter);

const storage = multer.memoryStorage();
const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowed = ['application/pdf','image/jpeg','image/png','image/webp'];
    cb(null, allowed.includes(file.mimetype));
  }
});

app.use(express.static(path.join(__dirname, 'public')));

app.post('/api/auth', (req, res) => {
  const { password } = req.body;
  const correct = process.env.ACCESS_PASSWORD || 'readers1234';
  if (password === correct) {
    res.json({ ok: true, academy: process.env.ACADEMY_NAME || '리더스학원' });
  } else {
    res.status(401).json({ ok: false, error: '비밀번호가 틀렸습니다.' });
  }
});

app.post('/api/generate', async (req, res) => {
  const { password, prompt } = req.body;
  const correct = process.env.ACCESS_PASSWORD || 'readers1234';
  if (password !== correct) return res.status(401).json({ error: '인증 실패' });
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return res.status(500).json({ error: 'API 키가 설정되지 않았습니다.' });
  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: 4000,
        system: '당신은 수학 내신 전문 분석가이자 출제 교사입니다. 모든 수식은 LaTeX로 표기하고 반드시 검산합니다.',
        messages: [{ role: 'user', content: prompt }]
      })
    });
    const data = await response.json();
    if (data.error) throw new Error(data.error.message);
    const text = data.content.map(c => c.text || '').join('');
    res.json({ ok: true, result: text, usage: data.usage });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/generate-with-files', upload.array('files', 5), async (req, res) => {
  const { password, prompt } = req.body;
  const correct = process.env.ACCESS_PASSWORD || 'readers1234';
  if (password !== correct) return res.status(401).json({ error: '인증 실패' });
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return res.status(500).json({ error: 'API 키가 설정되지 않았습니다.' });
  try {
    const content = [];
    if (req.files && req.files.length > 0) {
      for (const file of req.files) {
        const b64 = file.buffer.toString('base64');
        if (file.mimetype === 'application/pdf') {
          content.push({ type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: b64 } });
        } else {
          content.push({ type: 'image', source: { type: 'base64', media_type: file.mimetype, data: b64 } });
        }
      }
    }
    content.push({ type: 'text', text: prompt });
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: 4000,
        system: '당신은 수학 내신 전문 분석가이자 출제 교사입니다. 모든 수식은 LaTeX로 표기하고 반드시 검산합니다.',
        messages: [{ role: 'user', content }]
      })
    });
    const data = await response.json();
    if (data.error) throw new Error(data.error.message);
    const text = data.content.map(c => c.text || '').join('');
    res.json({ ok: true, result: text, usage: data.usage });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`서버 실행 중: http://localhost:${PORT}`);
});
