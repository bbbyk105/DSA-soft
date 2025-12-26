"use client";

import CookieConsent from "react-cookie-consent";
import Link from "next/link";

export default function CookieConsentBanner() {
  return (
    <CookieConsent
      location="bottom"
      buttonText="同意する"
      declineButtonText="拒否する"
      enableDeclineButton
      cookieName="dsa_cookie_consent"
      style={{
        background: "#2B373B",
        padding: "20px",
        fontSize: "14px",
        zIndex: 9999,
      }}
      buttonStyle={{
        background: "#4CAF50",
        color: "#fff",
        fontSize: "14px",
        padding: "10px 20px",
        borderRadius: "4px",
        marginLeft: "10px",
        cursor: "pointer",
      }}
      declineButtonStyle={{
        background: "#f44336",
        color: "#fff",
        fontSize: "14px",
        padding: "10px 20px",
        borderRadius: "4px",
        cursor: "pointer",
      }}
      expires={365}
      onAccept={() => {
        // Cookie同意時にセッションCookieを設定するためのフラグ
        if (typeof window !== "undefined") {
          document.cookie =
            "dsa_cookie_accepted=true; path=/; max-age=31536000";
        }
      }}
      onDecline={() => {
        // Cookie拒否時はセッションCookieを削除
        if (typeof window !== "undefined") {
          document.cookie =
            "dsa_session_id=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT";
          document.cookie =
            "dsa_cookie_accepted=false; path=/; max-age=31536000";
        }
      }}
    >
      このサイトでは、サービス向上のためCookieを使用しています。
      <Link href="/terms" className="text-blue-400 hover:underline ml-1">
        利用規約
      </Link>
      および
      <Link href="/privacy" className="text-blue-400 hover:underline ml-1">
        プライバシーポリシー
      </Link>
      をご確認ください。
    </CookieConsent>
  );
}
