import { Bell, Bot, Download, FileSearch, Inbox, KeyRound, LayoutDashboard, Lightbulb, Radio, Route, Settings2, ShieldCheck, Sparkles, Workflow } from "lucide-react";
import { NavLink, Outlet, useLocation } from "react-router-dom";
import { useEffect, useState } from "react";
import { api } from "../api";
import { AutomationActivityBar } from "./AutomationActivityBar";
import { useExperienceMode } from "./ExperienceMode";

const links = [
  { to: "/dashboard", label: "Ana Sayfa", icon: LayoutDashboard },
  { to: "/ai-builder", label: "Yazarak Otomasyon", icon: Sparkles },
  { to: "/recorder", label: "Göstererek Otomasyon", icon: Radio },
  { to: "/workflows", label: "Otomasyonlarım", icon: Workflow },
  { to: "/jobs", label: "Hazırlanan Dosyalar", icon: Download },
  { to: "/approvals", label: "Onay Bekleyenler", icon: Inbox },
  { to: "/documents", label: "Belgeler", icon: FileSearch },
  { to: "/connectors", label: "Hesaplar ve Bağlantılar", icon: KeyRound },
  { to: "/opportunities", label: "Fikirler ve Kazanç", icon: Lightbulb, advancedOnly: true },
  { to: "/compliance", label: "Güvenlik ve Kayıtlar", icon: ShieldCheck, advancedOnly: true }
];

export function AppLayout() {
  const [pending, setPending] = useState(0);
  const location = useLocation();
  const { mode, setMode } = useExperienceMode();
  const visibleLinks = links.filter((link) => mode === "advanced" || !link.advancedOnly);
  const mobileLinks = links.filter((link) => ["/dashboard", "/ai-builder", "/workflows", "/jobs", "/approvals"].includes(link.to));

  useEffect(() => {
    api.dashboard().then((payload) => {
      setPending((payload.approvals ?? []).filter((approval) => approval.status === "pending").length);
    }).catch(() => setPending(0));
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
          {visibleLinks.map((link) => {
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
        <div className="absolute bottom-0 left-0 right-0 border-t border-line bg-white p-4 text-sm text-muted">
          <div className="flex items-center gap-2 font-medium text-ink">
            <ShieldCheck size={17} className="text-brand" />
            Uyum katmanı aktif
          </div>
          <p className="mt-2 leading-5">{mode === "simple" ? "Yalnızca günlük kullanımda gereken ekranlar açık." : "Teknik izleme ve yönetim ekranları açık."}</p>
        </div>
      </aside>

      <div className="lg:pl-64">
        <div className="sticky top-0 z-10">
          <header className="flex h-16 items-center justify-between border-b border-line bg-white/95 px-4 backdrop-blur md:px-8">
            <div className="flex min-w-0 items-center gap-3">
              <Route className="hidden text-brand sm:block" size={20} />
              <div>
                <div className="text-sm font-semibold text-ink"><span className="sm:hidden">OtoFlow</span><span className="hidden sm:inline">OtoFlow Çalışma Alanı</span></div>
                <div className="hidden text-xs text-muted sm:block">Otomasyonlarınız ve bekleyen işleriniz</div>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <div className="inline-flex rounded-md border border-line bg-slate-50 p-1" aria-label="Görünüm seçimi">
                <button className={`min-h-8 rounded px-2 text-xs font-semibold sm:px-3 ${mode === "simple" ? "bg-white text-brand shadow-sm" : "text-muted"}`} onClick={() => setMode("simple")} aria-pressed={mode === "simple"}>Sade</button>
                <button className={`min-h-8 rounded px-2 text-xs font-semibold sm:px-3 ${mode === "advanced" ? "bg-white text-brand shadow-sm" : "text-muted"}`} onClick={() => setMode("advanced")} aria-pressed={mode === "advanced"}><Settings2 className="mr-1 inline" size={13} />Gelişmiş</button>
              </div>
              <div className="hidden rounded-full bg-emerald-50 px-3 py-1 text-xs font-medium text-emerald-800 ring-1 ring-emerald-200 md:block">
                E-imza/PIN saklama kapalı
              </div>
              <NavLink
                to="/approvals"
                className="relative hidden sm:inline-flex icon-button"
                title="Bekleyen onayları aç"
                aria-label={pending > 0 ? `${pending} bekleyen onayı aç` : "Onay görevlerini aç"}
              >
                <Bell size={19} />
                {pending > 0 ? <span className="notification-count" aria-hidden="true">{pending}</span> : null}
              </NavLink>
            </div>
          </header>
          <AutomationActivityBar />
        </div>
        <main className="mx-auto w-full max-w-7xl px-4 pb-24 pt-6 md:px-8 lg:pb-6">
          <Outlet />
        </main>
      </div>

      <nav className="fixed inset-x-0 bottom-0 z-30 grid grid-cols-5 border-t border-line bg-white px-1 pb-[max(6px,env(safe-area-inset-bottom))] pt-1 lg:hidden" aria-label="Temel menü">
        {mobileLinks.map((link) => {
          const Icon = link.icon;
          return <NavLink key={link.to} to={link.to} className={({ isActive }) => `relative flex min-h-14 flex-col items-center justify-center gap-1 rounded text-[10px] font-semibold ${isActive ? "text-brand" : "text-muted"}`}>
            <Icon size={19} />
            <span className="max-w-full truncate px-1">{link.to === "/ai-builder" ? "Oluştur" : link.to === "/workflows" ? "Otomasyon" : link.to === "/jobs" ? "Dosyalar" : link.to === "/approvals" ? "Onaylar" : link.label}</span>
            {link.to === "/approvals" && pending > 0 ? <span className="notification-count right-2 top-1" aria-hidden="true">{pending}</span> : null}
          </NavLink>;
        })}
      </nav>
    </div>
  );
}
