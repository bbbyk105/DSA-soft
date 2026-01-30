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
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    // スマホ判定（画面幅が768px未満）
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 768);
    };
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  useEffect(() => {
    // スマホの場合は初期化しない
    if (isMobile) {
      return;
    }

    let cancelled = false;
    let intersectionObserver: IntersectionObserver | null = null;

    const waitForContainerSize = async (maxRetries = 20): Promise<boolean> => {
      for (let i = 0; i < maxRetries; i++) {
        if (!containerRef.current) return false;
        const rect = containerRef.current.getBoundingClientRect();
        // PC向け：最小サイズを400px以上に設定
        if (rect.width >= 400 && rect.height >= 400) {
          return true;
        }
        await new Promise(resolve => setTimeout(resolve, 50));
      }
      return false;
    };

    const load = async () => {
      try {
        if (!containerRef.current) return;

        // コンテナが表示されていることを確認（IntersectionObserverを使用）
        const isVisible = await new Promise<boolean>((resolve) => {
          if (!containerRef.current) {
            resolve(false);
            return;
          }

          // 既に表示されているかチェック
          const initialRect = containerRef.current.getBoundingClientRect();
          if (initialRect.width > 0 && initialRect.height > 0) {
            resolve(true);
            return;
          }

          // IntersectionObserverで表示を待機
          let resolved = false;
          intersectionObserver = new IntersectionObserver(
            (entries) => {
              if (resolved) return;
              const entry = entries[0];
              if (entry.isIntersecting && entry.intersectionRatio > 0) {
                resolved = true;
                resolve(true);
                if (intersectionObserver && containerRef.current) {
                  intersectionObserver.unobserve(containerRef.current);
                }
              }
            },
            { threshold: 0.01 }
          );

          intersectionObserver.observe(containerRef.current);

          // タイムアウト（500ms後に強制的にチェック）
          setTimeout(() => {
            if (!resolved && containerRef.current) {
              const rect = containerRef.current.getBoundingClientRect();
              if (rect.width > 0 && rect.height > 0) {
                resolved = true;
                resolve(true);
                if (intersectionObserver && containerRef.current) {
                  intersectionObserver.unobserve(containerRef.current);
                }
              } else {
                resolved = true;
                resolve(false);
              }
            }
          }, 500);
        });

        if (!isVisible || !containerRef.current) {
          console.warn('Mol* container is not visible, skipping initialization');
          return;
        }

        // コンテナのサイズが確実に確保されるまで待機
        const hasSize = await waitForContainerSize();
        if (!hasSize || !containerRef.current) {
          console.warn('Mol* container has insufficient size, skipping initialization');
          return;
        }

        // コンテナのサイズを明示的に設定（PC向け）
        const containerElement = containerRef.current;
        const rect = containerElement.getBoundingClientRect();
        
        // PC向け：最小サイズを400px以上に設定
        if (rect.width < 400) {
          containerElement.style.width = '100%';
          containerElement.style.minWidth = '400px';
        }
        if (rect.height < 400) {
          containerElement.style.height = '600px';
          containerElement.style.minHeight = '600px';
          // 強制的にサイズを再計算
          containerElement.offsetHeight; // リフローを強制
        }

        // 既存のviewerがある場合は、新しいPDBをロードするだけ
        if (viewerRef.current) {
          // pdbIdが同じ場合は何もしない
          if (viewerRef.current._currentPdbId === pdbId) {
            return;
          }
          try {
            await viewerRef.current.loadPdb(pdbId);
            if (!cancelled) {
              setError(null);
              viewerRef.current._currentPdbId = pdbId;
            }
            return;
          } catch (e) {
            // ロードに失敗した場合は、新しいviewerを作成
            console.warn(
              "Failed to load PDB in existing viewer, creating new viewer",
              e,
            );
            // 既存のviewerを完全に破棄
            if (viewerRef.current?.plugin?.destroy) {
              try {
                viewerRef.current.plugin.destroy();
              } catch (destroyError) {
                console.error("Mol* destroy error", destroyError);
              }
            }
            viewerRef.current = null;
            // コンテナを完全にクリア（React rootも含めて）
            if (containerRef.current) {
              // すべての子要素を削除
              while (containerRef.current.firstChild) {
                containerRef.current.removeChild(containerRef.current.firstChild);
              }
              // React rootが存在する場合はクリア
              if ((containerRef.current as any)._reactRootContainer) {
                delete (containerRef.current as any)._reactRootContainer;
              }
            }
          }
        }

        // Viewer 実装を ESM ビルドから取得（背景画像を含む正式なパスを利用）
        const { Viewer } = await import("molstar/lib/apps/viewer/app");

        if (!containerRef.current) return;

        // コンテナが既にReact rootとして使用されていないか確認
        const finalContainer = containerRef.current;
        // React 18のcreateRootで使用されたコンテナをクリア
        if ((finalContainer as any)._reactRootContainer) {
          // すべての子要素を削除
          while (finalContainer.firstChild) {
            finalContainer.removeChild(finalContainer.firstChild);
          }
          delete (finalContainer as any)._reactRootContainer;
        }

        // 最終的なサイズ確認（Viewer作成直前）
        // PC向け：最小サイズを400px以上に設定
        const finalRect = finalContainer.getBoundingClientRect();
        if (finalRect.width < 400 || finalRect.height < 400) {
          console.warn('Mol* container has insufficient size before Viewer.create', {
            width: finalRect.width,
            height: finalRect.height,
            windowWidth: window.innerWidth
          });
          return;
        }

        const viewer = await Viewer.create(finalContainer, {
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
        // 現在のpdbIdを保存
        (viewerRef.current as any)._currentPdbId = pdbId;

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
              : "Mol* Viewerの初期化に失敗しました。",
          );
        }
      }
    };

    load();

    return () => {
      cancelled = true;
      // IntersectionObserverのクリーンアップ
      if (intersectionObserver && containerRef.current) {
        intersectionObserver.unobserve(containerRef.current);
        intersectionObserver.disconnect();
      }
      // クリーンアップはコンポーネントのアンマウント時のみ実行
      // pdbIdが変わるだけの場合は、viewerを保持する
      // コンポーネントが完全にアンマウントされる時だけ破棄
      if (viewerRef.current?.plugin?.destroy) {
        try {
          viewerRef.current.plugin.destroy();
        } catch (e) {
          console.error("Mol* destroy error", e);
        }
      }
      // コンテナのクリーンアップ（React rootも含めて）
      if (containerRef.current) {
        // すべての子要素を削除
        while (containerRef.current.firstChild) {
          containerRef.current.removeChild(containerRef.current.firstChild);
        }
        // React rootが存在する場合はクリア
        if ((containerRef.current as any)._reactRootContainer) {
          delete (containerRef.current as any)._reactRootContainer;
        }
      }
      viewerRef.current = null;
    };
  }, [pdbId, isMobile]);

  // スマホの場合は代替メッセージを表示
  if (isMobile) {
    return (
      <div
        className={`relative w-full h-[400px] ${className}`}
        style={{ minHeight: '400px' }}
      >
        <div className="absolute inset-0 flex items-center justify-center bg-gray-50 rounded-lg border border-gray-200">
          <div className="text-center space-y-2 px-4">
            <p className="text-gray-600 font-semibold">3D Viewer</p>
            <p className="text-sm text-gray-500">
              3D構造ビューアーはPCでの閲覧を推奨しています。
            </p>
            <p className="text-xs text-gray-400 mt-2">
              スマートフォンでは表示できません。
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      className={`relative w-full h-[600px] ${className}`}
      style={{ minHeight: '600px' }}
    >
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
        style={{ minHeight: '600px', width: '100%', height: '100%' }}
      />
    </div>
  );
}
