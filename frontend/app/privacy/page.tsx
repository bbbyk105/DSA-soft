import Link from "next/link";

export default function PrivacyPage() {
  return (
    <div className="min-h-screen p-8 bg-gray-50">
      <div className="max-w-4xl mx-auto bg-white rounded-lg shadow-md p-8">
        <div className="mb-6">
          <Link
            href="/analysis"
            className="inline-flex items-center text-blue-600 hover:underline mb-4"
          >
            <span className="mr-1">←</span>
            ホームに戻る
          </Link>
        </div>

        <h1 className="text-3xl font-bold mb-6">プライバシーポリシー</h1>

        <section className="mb-6">
          <h2 className="text-2xl font-semibold mb-3">1. 個人情報の収集について</h2>
          <p className="text-gray-700 leading-relaxed">
            本サービスでは、以下の情報を収集する場合があります：
          </p>
          <ul className="list-disc list-inside text-gray-700 space-y-2 ml-4 mt-3">
            <li>解析に使用するUniProt ID</li>
            <li>解析パラメータ（sequence_ratio、min_structures等）</li>
            <li>解析結果（統計情報、メトリクス等）</li>
            <li>セッションID（Cookie経由）</li>
          </ul>
        </section>

        <section className="mb-6">
          <h2 className="text-2xl font-semibold mb-3">2. Cookieの使用について</h2>
          <p className="text-gray-700 leading-relaxed mb-3">
            本サービスでは、以下のCookieを使用します：
          </p>
          <div className="bg-gray-50 p-4 rounded-lg overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b">
                  <th className="text-left py-2 px-2">Cookie名</th>
                  <th className="text-left py-2 px-2">目的</th>
                  <th className="text-left py-2 px-2">有効期限</th>
                </tr>
              </thead>
              <tbody>
                <tr className="border-b">
                  <td className="py-2 px-2 font-mono text-xs">dsa_session_id</td>
                  <td className="py-2 px-2">ユーザーごとの解析履歴管理</td>
                  <td className="py-2 px-2">30日</td>
                </tr>
                <tr className="border-b">
                  <td className="py-2 px-2 font-mono text-xs">dsa_cookie_consent</td>
                  <td className="py-2 px-2">Cookie同意状態の保存</td>
                  <td className="py-2 px-2">365日</td>
                </tr>
                <tr>
                  <td className="py-2 px-2 font-mono text-xs">dsa_cookie_accepted</td>
                  <td className="py-2 px-2">Cookie同意の有無</td>
                  <td className="py-2 px-2">365日</td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>

        <section className="mb-6">
          <h2 className="text-2xl font-semibold mb-3">3. 個人情報の利用目的</h2>
          <p className="text-gray-700 leading-relaxed">
            収集した個人情報は、以下の目的で利用します：
          </p>
          <ul className="list-disc list-inside text-gray-700 space-y-2 ml-4 mt-3">
            <li>DSA解析サービスの提供</li>
            <li>解析結果の表示・管理</li>
            <li>サービス品質の向上</li>
            <li>ユーザーごとの解析履歴の管理</li>
          </ul>
        </section>

        <section className="mb-6">
          <h2 className="text-2xl font-semibold mb-3">4. 個人情報の第三者提供</h2>
          <p className="text-gray-700 leading-relaxed">
            当方は、法令に基づく場合を除き、ユーザーの同意なく個人情報を第三者に提供することはありません。
          </p>
        </section>

        <section className="mb-6">
          <h2 className="text-2xl font-semibold mb-3">5. 個人情報の管理</h2>
          <p className="text-gray-700 leading-relaxed">
            当方は、個人情報の漏洩、滅失または毀損の防止その他の個人情報の安全管理のため、必要かつ適切な措置を講じます。
          </p>
        </section>

        <section className="mb-6">
          <h2 className="text-2xl font-semibold mb-3">6. Cookieの無効化</h2>
          <p className="text-gray-700 leading-relaxed">
            Cookieの使用を無効化したい場合は、ブラウザの設定からCookieを無効にすることができます。
            ただし、Cookieを無効にした場合、本サービスの一部機能が利用できなくなる場合があります。
          </p>
        </section>

        <section className="mb-6">
          <h2 className="text-2xl font-semibold mb-3">7. お問い合わせ</h2>
          <p className="text-gray-700 leading-relaxed">
            個人情報の取り扱いに関するお問い合わせは、以下までご連絡ください。
          </p>
        </section>

        <div className="mt-8 pt-6 border-t">
          <p className="text-sm text-gray-500">制定日: 2024年12月26日</p>
        </div>
      </div>
    </div>
  );
}

