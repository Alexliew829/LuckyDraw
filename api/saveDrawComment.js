// api/saveDrawComment.js
import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

const serviceAccount = JSON.parse(process.env.FIREBASE_ADMIN_KEY);

if (!getApps().length) {
  initializeApp({ credential: cert(serviceAccount) });
}

const db = getFirestore();

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Only POST requests are allowed' });
  }

  const { post_id, comment_id, message, user_id, user_name, number } = req.body;

  if (!post_id || !comment_id || !number) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  try {
    const docRef = db.collection('draw_comments').doc(comment_id);

    await docRef.set({
      post_id,
      comment_id,
      message: message || '',
      user_id: user_id || null,
      user_name: user_name || null,
      number,
      timestamp: Date.now()
    });

    return res.status(200).json({ success: true, saved: comment_id });
  } catch (error) {
    return res.status(500).json({ error: 'Failed to save comment', details: error.message });
  }
}
