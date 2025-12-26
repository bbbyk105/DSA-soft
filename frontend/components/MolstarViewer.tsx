"use client";

import { useEffect, useRef, useState } from "react";
import "molstar/build/viewer/molstar.css";

interface MolstarViewerProps {
  pdbId: string;
  className?: string;
}

/**
 * npm 版 Mol* の Viewer を直接初期化して 3D 表示するコンポーネント
 * - PDBe iframe ではなく、Mol* の API を利用してハイライトなどの拡張に備える
 */
export default function MolstarViewer({
  pdbId,
  className = "",
}: MolstarViewerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const viewerRef = useRef<any>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      try {
        // Viewer 実装を ESM ビルドから取得（背景画像を含む正式なパスを利用）
        const { Viewer } = await import("molstar/lib/apps/viewer/app");

        if (!containerRef.current) return;

        // 既存インスタンスを破棄
        if (viewerRef.current?.plugin?.destroy) {
          viewerRef.current.plugin.destroy();
        }

        const viewer = await Viewer.create(containerRef.current, {
          layoutIsExpanded: false,
          layoutShowSequence: true,
          layoutShowControls: true,
          layoutShowRemoteState: false,
          layoutShowLog: false,
          viewportShowExpand: true,
          viewportShowSelectionMode: true,
          disabledExtensions: [
            "mp4-export", // ネイティブ依存
            "backgrounds", // 画像アセット解決エラーを回避
            // 体積データ/セグメンテーション拡張（外部 API への fetch を行い失敗している）
            // Mol* 内部の拡張キー名は "volseg" なので、それを無効化する
            "volseg",
          ],
        });

        viewerRef.current = viewer;

        await viewer.loadPdb(pdbId);

        if (!cancelled) {
          setError(null);
        }
      } catch (e) {
        console.error("Mol* load error", e);
        if (!cancelled) {
          setError(
            e instanceof Error
              ? e.message
              : "Mol* Viewerの初期化に失敗しました。"
          );
        }
      }
    };

    load();

    return () => {
      cancelled = true;
      if (viewerRef.current?.plugin?.destroy) {
        try {
          viewerRef.current.plugin.destroy();
        } catch (e) {
          console.error("Mol* destroy error", e);
        }
      }
      viewerRef.current = null;
    };
  }, [pdbId]);

  return (
    <div className={`relative w-full h-[400px] sm:h-[500px] md:h-[600px] ${className}`}>
      {error && (
        <div className="absolute inset-0 flex items-center justify-center bg-red-50 rounded z-10">
          <div className="text-center space-y-2 px-4">
            <p className="text-red-600 font-semibold">Mol* Viewer Error</p>
            <p className="text-sm text-red-500">{error}</p>
          </div>
        </div>
      )}
      <div
        ref={containerRef}
        className="w-full h-full rounded-lg border border-gray-200 overflow-hidden"
      />
    </div>
  );
}
