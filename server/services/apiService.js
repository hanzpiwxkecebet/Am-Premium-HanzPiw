const axios = require('axios');
require('dotenv').config();

const BASE_URL = process.env.API_BASE_URL || 'https://ellreyxml.web.id/alight-motion';
const TIMEOUT = parseInt(process.env.API_TIMEOUT || '60000');

const headers = {
  'Accept': 'application/json',
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
  'Cache-Control': 'no-cache'
};

async function sendVerification(email) {
  const url = `${BASE_URL}/send`;
  try {
    const response = await axios.get(url, {
      params: { email },
      headers,
      timeout: TIMEOUT
    });
    return { success: true, data: response.data, status: response.status };
  } catch (error) {
    const status = error.response?.status || 500;
    const msg = error.response?.data?.message || error.message || 'API request failed';
    console.error(`[API] sendVerification error: ${msg}`);
    return { success: false, error: msg, status };
  }
}

async function verifyPremium(email, link) {
  const url = `${BASE_URL}/verify`;
  try {
    const response = await axios.get(url, {
      params: { email, link },
      headers,
      timeout: TIMEOUT
    });
    return { success: true, data: response.data, status: response.status };
  } catch (error) {
    const status = error.response?.status || 500;
    const msg = error.response?.data?.message || error.message || 'Verification failed';
    console.error(`[API] verifyPremium error: ${msg}`);
    return { success: false, error: msg, status };
  }
}

async function checkApiStatus() {
  try {
    const response = await axios.get(`${BASE_URL}/send`, {
      params: { email: 'test@test.com' },
      timeout: 5000,
      headers
    });
    return { online: true, status: response.status };
  } catch (error) {
    return { online: !!error.response, status: error.response?.status || 0 };
  }
}

function parseApiResponse(data) {
  if (!data) return { success: false, message: 'Empty response', raw: null };

  // Detect success
  const isSuccess = data.success === true || data.status === true || data.ok === true;
  
  // Extract message
  const message = data.message || data.msg || data.result || data.text || '';
  
  // Extract data payload
  const payload = data.data || data.result || data.response || data;
  
  // Extract link/url if any
  const link = data.link || data.url || data.download || null;

  return { success: isSuccess, message, payload, link, raw: data };
}

module.exports = { sendVerification, verifyPremium, checkApiStatus, parseApiResponse };
