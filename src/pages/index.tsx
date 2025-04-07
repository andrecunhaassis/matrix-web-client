import { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import * as sdk from 'matrix-js-sdk';

export default function Login() {
  const [username, setUsername] = useState('');
  const [matrixDomain, setMatrixDomain] = useState('matrix.assis.cc'); // novo estado
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  // Preenche o username com a conta já armazenada e redireciona se já estiver logado
  useEffect(() => {
    console.log('useEffect');
    const savedUser = localStorage.getItem('matrixUserId') || '';
    setUsername(savedUser);
    if (localStorage.getItem('matrixAccessToken')) {
      router.push('/chat');
    }
  }, []);  // executa apenas uma vez na montagem


  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      // Verificar se o username contém o domínio do Matrix
      const userId = username.includes(':') ? username : `@${username}:${matrixDomain}`;

      // Criar cliente Matrix
      const client = sdk.createClient({
        baseUrl: `https://${matrixDomain}`
      });

      // Fazer login
      const loginResponse = await client.login('m.login.password', {
        user: userId.replace(/\s+/g, ''),
        password: password.replace(/\s+/g, '')
      });

      // Salva informações de autenticação no localStorage
      localStorage.setItem('matrixAccessToken', loginResponse.access_token);
      localStorage.setItem('matrixUserId', loginResponse.user_id);
      localStorage.setItem('matrixHomeServer', matrixDomain);

      // Redireciona para a página de chat
      router.push('/chat');
    } catch (err) {
      console.error('Erro no login:', err);
      setError('Falha ao fazer login. Verifique suas credenciais.');
    } finally {
      setLoading(false);
    }
  };
  //   e.preventDefault();
  //   setLoading(true);
  //   setError('');

  //   try {
  //     // Garante que o userId esteja no formato completo, mas sem o "@" para o campo identifier
  //     const userId = username.includes(':') ? username : `@${username}:${matrixDomain}`;
  //     const identifierUser = userId.startsWith('@') ? userId.slice(1) : userId;

  //     // Cria cliente Matrix com o domínio informado
  //     const client = sdk.createClient({
  //       baseUrl: `https://${matrixDomain}`,
  //     });

  //     // Faz login usando o payload atualizado
  //     const loginResponse = await client.login('m.login.password', {
  //       identifier: {
  //         type: 'm.id.user',
  //         user: identifierUser,
  //       },
  //       password: password,
  //     });

  //     // Salva informações de autenticação no localStorage
  //     localStorage.setItem('matrixAccessToken', loginResponse.access_token);
  //     localStorage.setItem('matrixUserId', loginResponse.user_id);
  //     localStorage.setItem('matrixHomeServer', matrixDomain);

  //     // Redireciona para a página de chat
  //     router.push('/chat');
  //   } catch (err) {
  //     console.error('Erro no login:', err);
  //     setError('Falha ao fazer login. Verifique suas credenciais.');
  //   } finally {
  //     setLoading(false);
  //   }
  // };

  return (
    <div className="min-h-screen bg-gray-100 flex items-center justify-center">
      <div className="max-w-md w-full bg-white rounded-lg shadow-md p-8">
        <h1 className="text-2xl font-bold text-center mb-6">Cliente Matrix</h1>

        <form onSubmit={handleLogin} className="space-y-6">
          <div>
            <label htmlFor="matrixDomain" className="block text-sm font-medium text-gray-700 mb-1">
              Domínio Matrix
            </label>
            <input
              id="matrixDomain"
              type="text"
              value={matrixDomain}
              onChange={(e) => setMatrixDomain(e.target.value)}
              placeholder="matrix.assis.cc"
              className="w-full px-3 py-2 border border-gray-300 rounded-md"
              required
            />
          </div>

          <div>
            <label htmlFor="username" className="block text-sm font-medium text-gray-700 mb-1">
              ID do usuário
            </label>
            <input
              id="username"
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="@usuario:matrix.assis.cc"
              className="w-full px-3 py-2 border border-gray-300 rounded-md"
              required
            />
          </div>

          <div>
            <label htmlFor="password" className="block text-sm font-medium text-gray-700 mb-1">
              Senha
            </label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md"
              required
            />
          </div>

          {error && <p className="text-red-500 text-sm">{error}</p>}

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-blue-500 text-white py-2 px-4 rounded-md hover:bg-blue-600 disabled:bg-blue-300"
          >
            {loading ? 'Entrando...' : 'Entrar'}
          </button>
        </form>
      </div>
    </div>
  );
}
