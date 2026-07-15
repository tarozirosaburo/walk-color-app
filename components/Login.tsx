'use client';

import { useState } from 'react';
import { supabase } from '@/lib/supabase';

export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError('');

    const { error } = await supabase.auth.signInWithPassword({ email, password });

    if (error) {
      setError('ログインに失敗しました。メールアドレスとパスワードを確認してください。');
    }
    setLoading(false);
  }

  return (
    <main style={{ maxWidth: 360, margin: '4rem auto', padding: '1rem' }}>
      <h1 style={{ fontSize: 20, textAlign: 'center' }}>散歩の地図</h1>
      <p style={{ fontSize: 13, color: '#888', textAlign: 'center', marginBottom: 24 }}>
        ログインしてください
      </p>
      <form onSubmit={handleSubmit}>
        <input
          type="email"
          placeholder="メールアドレス"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          style={{
            width: '100%',
            padding: 10,
            marginBottom: 8,
            borderRadius: 8,
            border: '1px solid #ccc',
            boxSizing: 'border-box',
          }}
        />
        <input
          type="password"
          placeholder="パスワード"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
          style={{
            width: '100%',
            padding: 10,
            marginBottom: 12,
            borderRadius: 8,
            border: '1px solid #ccc',
            boxSizing: 'border-box',
          }}
        />
        <button
          type="submit"
          disabled={loading}
          style={{
            width: '100%',
            background: '#0F6E56',
            color: 'white',
            padding: 12,
            borderRadius: 8,
            border: 'none',
            fontSize: 14,
          }}
        >
          {loading ? 'ログイン中...' : 'ログイン'}
        </button>
        {error && <p style={{ color: '#c0392b', fontSize: 13, marginTop: 10 }}>{error}</p>}
      </form>
    </main>
  );
}
