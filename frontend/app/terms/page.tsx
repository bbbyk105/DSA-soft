import Link from "next/link";

export default function TermsPage() {
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

        <h1 className="text-3xl font-bold mb-6">利用規約</h1>

        <section className="mb-6">
          <h2 className="text-2xl font-semibold mb-3">第1条（適用）</h2>
          <p className="text-gray-700 leading-relaxed">
            本利用規約（以下「本規約」といいます。）は、DSA Analysisサービス（以下「本サービス」といいます。）の利用条件を定めるものです。
            登録ユーザーの皆さま（以下「ユーザー」といいます。）には、本規約に従って、本サービスをご利用いただきます。
          </p>
        </section>

        <section className="mb-6">
          <h2 className="text-2xl font-semibold mb-3">第2条（Cookieの使用）</h2>
          <p className="text-gray-700 leading-relaxed mb-3">
            本サービスでは、以下の目的でCookieを使用します：
          </p>
          <ul className="list-disc list-inside text-gray-700 space-y-2 ml-4">
            <li>ユーザーごとの解析履歴の管理</li>
            <li>サービス品質の向上</li>
            <li>セッション管理</li>
          </ul>
          <p className="text-gray-700 leading-relaxed mt-3">
            Cookieの使用に同意いただけない場合、一部の機能が制限される場合があります。
          </p>
        </section>

        <section className="mb-6">
          <h2 className="text-2xl font-semibold mb-3">第3条（禁止事項）</h2>
          <p className="text-gray-700 leading-relaxed">
            ユーザーは、本サービスの利用にあたり、以下の行為をしてはなりません。
          </p>
          <ul className="list-disc list-inside text-gray-700 space-y-2 ml-4 mt-3">
            <li>法令または公序良俗に違反する行為</li>
            <li>犯罪行為に関連する行為</li>
            <li>
              本サービスの内容等、本サービスに含まれる著作権、商標権ほか知的財産権を侵害する行為
            </li>
            <li>
              本サービス、ほかのユーザー、またはその他第三者のサーバーまたはネットワークの機能を破壊したり、妨害したりする行為
            </li>
            <li>本サービスによって得られた情報を商業的に利用する行為</li>
            <li>本サービスの運営を妨害するおそれのある行為</li>
            <li>不正アクセス、不正な方法による解析の実行</li>
          </ul>
        </section>

        <section className="mb-6">
          <h2 className="text-2xl font-semibold mb-3">第4条（本サービスの提供の停止等）</h2>
          <p className="text-gray-700 leading-relaxed">
            当方は、以下のいずれかの事由があると判断した場合、ユーザーに事前に通知することなく本サービスの全部または一部の提供を停止または中断することができるものとします。
          </p>
          <ul className="list-disc list-inside text-gray-700 space-y-2 ml-4 mt-3">
            <li>
              本サービスにかかるコンピュータシステムの保守点検または更新を行う場合
            </li>
            <li>
              地震、落雷、火災、停電または天災などの不可抗力により、本サービスの提供が困難となった場合
            </li>
            <li>コンピュータまたは通信回線等が事故により停止した場合</li>
            <li>その他、当方が本サービスの提供が困難と判断した場合</li>
          </ul>
        </section>

        <section className="mb-6">
          <h2 className="text-2xl font-semibold mb-3">第5条（保証の否認および免責）</h2>
          <p className="text-gray-700 leading-relaxed">
            当方は、本サービスに事実上または法律上の瑕疵（安全性、信頼性、正確性、完全性、有効性、特定の目的への適合性、セキュリティなどに関する欠陥、エラーやバグ、権利侵害などを含みます。）がないことを明示的にも黙示的にも保証しておりません。
          </p>
        </section>

        <section className="mb-6">
          <h2 className="text-2xl font-semibold mb-3">第6条（サービス内容の変更等）</h2>
          <p className="text-gray-700 leading-relaxed">
            当方は、ユーザーへの事前の告知をもって、本サービスの内容を変更、追加または廃止することがあります。
          </p>
        </section>

        <section className="mb-6">
          <h2 className="text-2xl font-semibold mb-3">第7条（利用規約の変更）</h2>
          <p className="text-gray-700 leading-relaxed">
            当方は以下の場合には、ユーザーの個別の同意を要せず、本規約を変更することができるものとします。
          </p>
          <ul className="list-disc list-inside text-gray-700 space-y-2 ml-4 mt-3">
            <li>本規約の変更がユーザーの一般の利益に適合するとき</li>
            <li>
              本規約の変更が本サービス利用契約の目的に反せず、かつ、変更の必要性、変更後の内容の相当性その他の変更に係る事情に照らして合理的なものであるとき
            </li>
          </ul>
        </section>

        <section className="mb-6">
          <h2 className="text-2xl font-semibold mb-3">第8条（個人情報の取扱い）</h2>
          <p className="text-gray-700 leading-relaxed">
            当方は、本サービスの利用によって取得する個人情報については、当方「
            <Link href="/privacy" className="text-blue-600 hover:underline">
              プライバシーポリシー
            </Link>
            」に従い適切に取り扱うものとします。
          </p>
        </section>

        <section className="mb-6">
          <h2 className="text-2xl font-semibold mb-3">第9条（準拠法・裁判管轄）</h2>
          <p className="text-gray-700 leading-relaxed">
            本規約の解釈にあたっては、日本法を準拠法とします。本サービスに関して紛争が生じた場合には、当方の本店所在地を管轄する裁判所を専属的合意管轄とします。
          </p>
        </section>

        <div className="mt-8 pt-6 border-t">
          <p className="text-sm text-gray-500">制定日: 2024年12月26日</p>
        </div>
      </div>
    </div>
  );
}

