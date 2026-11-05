export default function SiteLegalFooter() {
  return (
    <footer className="site-legal-footer">
      <div className="site-legal-footer-brand">
        <span aria-hidden="true">V</span>
        <p>
          <b>VeyaFrame</b>
          <small>内测版</small>
        </p>
      </div>

      <nav aria-label="法务与隐私">
        <a href="/legal#terms">用户协议</a>
        <a href="/legal#privacy">隐私政策</a>
        <a href="/legal#ai">AI 内容说明</a>
        <a href="/report">内容举报</a>
        <a href="mailto:support@chenju.work">联系我们</a>
      </nav>

      <small className="site-legal-footer-copy">© 2026 VeyaFrame</small>
    </footer>
  )
}
