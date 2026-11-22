const axios = require('axios');

const BASE_URL = process.env.API_BASE_URL || 'https://ellreyxml.web.id/alight-motion';
const TIMEOUT = parseInt(process.env.API_TIMEOUT) || 60000;
const MAX_RETRIES = 2;

const API_HEADERS = {
  Accept: 'application/json',
  'User-Agent': 'Mozilla/5.0 (Linux; Android 10; Mobile) AppleWebKit/537.36',
};

/**
 * Send verification email to target email
 * @param {string} email
 * @returns {Promise<object>} API response data
 */
async function sendVerification(email) {
  email = String(email || '').trim();
  if (!email) throw new Error('Email wajib diisi');

  let lastError;
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      const response = await axios.get(`${BASE_URL}/send`, {
        params: { email },
        headers: API_HEADERS,
        timeout: TIMEOUT,
      });
      return { success: true, data: response.data, attempt };
    } catch (error) {
      lastError = error;
      const msg = error.response?.data?.message || error.response?.data?.error || error.message;
      console.error(`[API] sendVerification attempt ${attempt} failed: ${msg}`);
      if (attempt < MAX_RETRIES) {
        await delay(2000 * attempt);
      }
    }
  }
  throw new Error(
    lastError?.response?.data?.message ||
    lastError?.response?.data?.error ||
    lastError?.message ||
    'Gagal mengirim verifikasi ke API'
  );
}

/**
 * Verify the link returned by the email
 * @param {string} email
 * @param {string} link
 * @returns {Promise<object>} API response data
 */
async function verifyLink(email, link) {
  email = String(email || '').trim();
  link = String(link || '').trim();
  if (!email) throw new Error('Email wajib diisi');
  if (!link) throw new Error('Link verifikasi wajib diisi');

  try {
    const response = await axios.get(`${BASE_URL}/verify`, {
      params: { email, link },
      headers: API_HEADERS,
      timeout: TIMEOUT,
    });

    // Determine success from response
    // ADAPTER: Adjust this if you know the exact response contract
    const data = response.data;
    const isSuccess = determineVerifySuccess(data);

    return { success: isSuccess, data, raw: data };
  } catch (error) {
    throw new Error(
      error.response?.data?.message ||
      error.response?.data?.error ||
      error.message ||
      'Verifikasi gagal'
    );
  }
}

/**
 * Determine if verify response indicates success.
 * API format: {"author":"ellreyxml","success":bool,"why":"..."}
 */
function determineVerifySuccess(data) {
  if (!data) return false;

  // Primary: explicit boolean field (ellreyxml API format)
  if (typeof data.success === 'boolean') return data.success;

  // Fallback: status string
  if (typeof data.status === 'string') {
    return data.status === 'success' || data.status === 'ok';
  }

  return false;
}

/**
 * Check API availability
 */
async function checkApiStatus() {
  try {
    const response = await axios.get(BASE_URL, {
      headers: API_HEADERS,
      timeout: 10000,
    });
    return { online: true, statusCode: response.status };
  } catch (error) {
    return { online: false, error: error.message };
  }
}

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

module.exports = { sendVerification, verifyLink, checkApiStatus };
