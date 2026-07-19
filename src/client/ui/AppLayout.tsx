import { Bell, Bot, FileSearch, Inbox, KeyRound, LayoutDashboard, Lightbulb, Radio, Route, ShieldCheck, Sparkles, Workflow } from "lucide-react";
import { NavLink, Outlet, useLocation } from "react-router-dom";
import { useEffect, useState } from "react";
import { api } from "../api";

const links = [
  { to: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { to: "/ai-builder", label: "AI ile Hazırla", icon: Sparkles },
  { to: "/recorder", label: "Recorder Studio", icon: Radio },
  { to: "/workflows", label: "Otomasyonlar", icon: Workflow },
  { to: "/jobs", label: "Robot İşleri", icon: Bot },
  { to: "/approvals", label: "Onaylar", icon: Inbox },
  { to: "/documents", label: "Dokümanlar", icon: FileSearch },
  { to: "/opportunities", label: "Fikir Havuzu", icon: Lightbulb },
  { to: "/connectors", label: "Entegrasyonlar", icon: KeyRound },
  { to: "/compliance", label: "Uyum", icon: ShieldCheck }
];

export function AppLayout() {
  const [pending, setPending] = useState(0);
  const location = useLocation();

  useEffect(() => {
    api.dashboard().then((payload) => {
      setPending(payload.approvals.filter((approval) => approval.status === "pending").length);
    });
  }, [location.pathname]);

  return (
    <div className="min-h-screen bg-surface text-ink">
      <aside className="fixed inset-y-0 left-0 z-20 hidden w-64 border-r border-line bg-white lg:block">
        <div className="flex h-16 items-center gap-3 border-b border-line px-5">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-brand text-white">
            <Bot size={22} />
          </div>
          <div>
              <div className="text-lg font-semibold">OtoFlow AI</div>
              <div className="text-xs text-muted">KOBİ RPA SaaS</div>
          </div>
        </div>
        <nav className="space-y-1 px-3 py-4">
          {links.map((link) => {
            const Icon = link.icon;
            return (
              <NavLink
                key={link.to}
                to={link.to}
                className={({ isActive }) => `nav-link ${isActive ? "nav-link-active" : ""}`}
              >
                <Icon size={18} />
                <span>{link.label}</span>
              </NavLink>
            );
          })}
        </nav>
        <div className="absolute bottom-0 left-0 right-0 border-t border-line p-4 text-sm text-muted">
          <div className="flex items-center gap-2 font-medium text-ink">
            <ShieldCheck size={17} className="text-brand" />
            Uyum katmanı aktif
          </div>
          <p className="mt-2 leading-5">Riskli robot adımları onay kapısı ve audit izi olmadan çalışmaz.</p>
        </div>
      </aside>

      <div className="lg:pl-64">
        <header className="sticky top-0 z-10 flex h-16 items-center justify-between border-b border-line bg-white/95 px-4 backdrop-blur md:px-8">
          <div className="flex min-w-0 items-center gap-3">
            <Route className="hidden text-brand sm:block" size={20} />
            <div>
              <div className="text-sm font-semibold text-ink">KOBİ Hyperautomation Konsolu</div>
              <div className="hidden text-xs text-muted sm:block">Robotlar, onaylar, dokümanlar ve uyum</div>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div className="hidden rounded-full bg-emerald-50 px-3 py-1 text-xs font-medium text-emerald-800 ring-1 ring-emerald-200 md:block">
              E-imza/PIN saklama kapalı
            </div>
            <button className="relative icon-button" title="Bekleyen onaylar">
              <Bell size={19} />
              {pending > 0 ? <span className="notification-count">{pending}</span> : null}
            </button>
          </div>
        </header>
        <main className="mx-auto w-full max-w-7xl px-4 py-6 md:px-8">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
