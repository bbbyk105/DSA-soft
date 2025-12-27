import Link from "next/link";
import Image from "next/image";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export default function Home() {
  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 md:px-8 py-12 sm:py-16">
        {/* ヘッダー */}
        <div className="text-center mb-12 sm:mb-16">
          <h1 className="text-3xl sm:text-4xl md:text-5xl font-bold mb-3">
            DSA
          </h1>
          <p className="text-lg sm:text-xl text-gray-600 mb-1">
            Distance-based Structural Analysis
          </p>
          <p className="text-sm sm:text-base text-gray-500 mb-4">
            タンパク質構造の距離スコアリング解析
          </p>
          <p className="text-xs sm:text-sm text-gray-400">
            学習院大学生命科学科岡田研究室
          </p>
        </div>

        {/* 機能説明 */}
        <div className="mb-12 sm:mb-16">
          <h2 className="text-2xl sm:text-3xl font-bold text-center mb-8 sm:mb-12">
            このツールについて
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 sm:gap-8">
            <Card>
              <CardHeader>
                <CardTitle>UniProt IDから解析</CardTitle>
                <CardDescription>
                  UniProt
                  IDを入力するだけで、PDBデータベースから関連する構造を自動的に取得し、解析を開始します。
                </CardDescription>
              </CardHeader>
              <CardContent>
                <ul className="list-disc list-inside space-y-2 text-sm text-gray-600">
                  <li>複数のUniProt IDを同時に解析可能</li>
                  <li>X-ray、NMR、電子顕微鏡など構造決定手法を選択可能</li>
                  <li>配列アライメント閾値の調整が可能</li>
                </ul>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>詳細な解析結果</CardTitle>
                <CardDescription>
                  距離スコアリング解析により、タンパク質構造の特徴を可視化します。
                </CardDescription>
              </CardHeader>
              <CardContent>
                <ul className="list-disc list-inside space-y-2 text-sm text-gray-600">
                  <li>DSA Scoreの分布グラフ</li>
                  <li>ヒートマップによる可視化</li>
                  <li>3D構造ビューア（Mol*）での確認</li>
                </ul>
              </CardContent>
            </Card>
          </div>
        </div>

        {/* 解析の流れ */}
        <div className="mb-12 sm:mb-16">
          <h2 className="text-2xl sm:text-3xl font-bold text-center mb-8 sm:mb-12">
            解析の流れ
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 sm:gap-8">
            <Card>
              <CardHeader>
                <div className="w-12 h-12 bg-blue-100 rounded-full flex items-center justify-center mb-4">
                  <span className="text-blue-600 font-bold text-xl">1</span>
                </div>
                <CardTitle className="text-lg">UniProt IDを入力</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-gray-600">
                  UniProt IDを入力し、解析パラメータを設定します。
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <div className="w-12 h-12 bg-blue-100 rounded-full flex items-center justify-center mb-4">
                  <span className="text-blue-600 font-bold text-xl">2</span>
                </div>
                <CardTitle className="text-lg">解析の実行</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-gray-600">
                  バックグラウンドで解析が実行されます。進捗状況をリアルタイムで確認できます。
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <div className="w-12 h-12 bg-blue-100 rounded-full flex items-center justify-center mb-4">
                  <span className="text-blue-600 font-bold text-xl">3</span>
                </div>
                <CardTitle className="text-lg">結果の確認</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-gray-600">
                  解析結果をグラフ、ヒートマップ、3D構造ビューアで確認できます。
                </p>
              </CardContent>
            </Card>
          </div>
        </div>

        {/* 結果の例 */}
        <div className="mb-12 sm:mb-16">
          <h2 className="text-2xl sm:text-3xl font-bold text-center mb-8 sm:mb-12">
            解析結果の例
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 sm:gap-8">
            <Card>
              <CardHeader>
                <CardTitle>DSA Score分布</CardTitle>
                <CardDescription>
                  各残基ペアの距離スコアの分布をグラフで表示します。
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="relative w-full aspect-[4/3] rounded-lg overflow-hidden bg-gray-100">
                  <Image
                    src="/images/Distance-score.png"
                    alt="DSA Score分布グラフ"
                    fill
                    className="object-contain"
                    sizes="(max-width: 768px) 100vw, (max-width: 1024px) 50vw, 33vw"
                  />
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>ヒートマップ</CardTitle>
                <CardDescription>
                  残基間の距離スコアを色で可視化したヒートマップを表示します。
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="relative w-full aspect-[4/3] rounded-lg overflow-hidden bg-gray-100">
                  <Image
                    src="/images/heatmap.png"
                    alt="DSA Scoreヒートマップ"
                    fill
                    className="object-contain"
                    sizes="(max-width: 768px) 100vw, (max-width: 1024px) 50vw, 33vw"
                  />
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>3D構造ビューア</CardTitle>
                <CardDescription>
                  Mol*を使用した3D構造ビューアで、タンパク質構造を確認できます。
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="relative w-full aspect-[4/3] rounded-lg overflow-hidden bg-gray-100">
                  <Image
                    src="/images/pdb.png"
                    alt="3D構造ビューア"
                    fill
                    className="object-contain"
                    sizes="(max-width: 768px) 100vw, (max-width: 1024px) 50vw, 33vw"
                  />
                </div>
              </CardContent>
            </Card>
          </div>
        </div>

        {/* フッターCTA */}
        <div className="text-center">
          <h2 className="text-2xl sm:text-3xl font-bold mb-4">
            さっそく解析を始めましょう
          </h2>
          <p className="text-gray-600 mb-6">
            UniProt IDを入力するだけで、簡単に解析を開始できます。
          </p>
          <Link href="/analysis">
            <Button size="lg" className="text-lg px-8 py-6">
              解析を始める
            </Button>
          </Link>
        </div>
      </div>
    </div>
  );
}
