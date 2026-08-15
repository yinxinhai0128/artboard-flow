import { Bot, Menu, User } from "lucide-react";
import { Avatar, Button, Tooltip } from "antd";
import { Link, useLocation, useNavigate } from "react-router-dom";

import {
  navigationTools,
  type NavigationToolSlug,
} from "@/constant/navigation-tools";
import { AppConfigModal } from "@/components/layout/app-config-modal";
import { MobileNavDrawer } from "@/components/layout/mobile-nav-drawer";
import { UserStatusActions } from "@/components/layout/user-status-actions";
import { useAuthStore } from "@/stores/use-auth-store";
import { cn } from "@/lib/utils";
import { useEffect, useRef, useState } from "react";
import { useAgentStore } from "@/stores/use-agent-store";

export function AppTopNav() {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const user = useAuthStore((state) => state.user);
  const logout = useAuthStore((state) => state.logout);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const autoConnectRef = useRef(false);
  const agentToken = useAgentStore((state) => state.token);
  const agentEnabled = useAgentStore((state) => state.enabled);
  const agentConnected = useAgentStore((state) => state.connected);
  const connectAgent = useAgentStore((state) => state.connectAgent);
  const togglePanel = useAgentStore((state) => state.togglePanel);
  const panelOpen = useAgentStore((state) => state.panelOpen);
  const hideHeader = /^\/canvas\/[^/]+/.test(pathname);
  const slug = pathname.split("/").filter(Boolean)[0];
  const activeToolSlug = navigationTools.some((tool) => tool.slug === slug)
    ? (slug as NavigationToolSlug)
    : undefined;

  useEffect(() => {
    if (
      autoConnectRef.current ||
      agentEnabled ||
      agentConnected ||
      !agentToken.trim()
    )
      return;
    autoConnectRef.current = true;
    connectAgent({ silent: true });
  }, [agentConnected, agentEnabled, agentToken, connectAgent]);

  return (
    <>
      {!hideHeader ? (
        <header className="sticky top-0 z-20 h-14 shrink-0 border-b border-white/8 bg-[#0d0d0d]/90 backdrop-blur-xl">
          <div className="mx-auto flex h-full max-w-7xl items-stretch justify-between gap-5 px-6">
            <div className="flex min-w-0 items-center">
              <Link
                to="/"
                className="flex h-full shrink-0 items-center gap-2 text-sm font-semibold leading-none tracking-tight text-white transition hover:text-stone-300"
              >
                <span
                  className="size-5 shrink-0 bg-current"
                  style={{
                    mask: "url(/logo.svg) center / contain no-repeat",
                    WebkitMask: "url(/logo.svg) center / contain no-repeat",
                  }}
                />
                <span className="text-base font-medium">ArtboardFlow</span>
                <span className="text-sm text-stone-500">无限画布</span>
              </Link>

              <button
                type="button"
                className="ml-3 inline-flex size-8 shrink-0 items-center justify-center text-stone-400 transition hover:text-white md:hidden"
                onClick={() => setMobileNavOpen(true)}
                aria-label="打开导航菜单"
                title="导航菜单"
              >
                <Menu className="size-5" />
              </button>

              <nav className="hide-scrollbar ml-8 hidden h-14 min-w-0 items-center gap-7 overflow-x-auto md:flex">
                {navigationTools.map((tool) => {
                  const Icon = tool.icon;
                  const active = tool.slug === activeToolSlug;
                  return (
                    <Link
                      key={tool.slug}
                      to={`/${tool.slug}`}
                      className={cn(
                        "relative flex h-14 shrink-0 items-center gap-2 text-sm leading-6 transition after:absolute after:inset-x-0 after:bottom-0 after:h-px",
                        active
                          ? "font-medium text-white after:bg-white"
                          : "text-stone-400 after:bg-transparent hover:text-white",
                      )}
                    >
                      <Icon className="size-4" />
                      <span className="truncate">{tool.label}</span>
                    </Link>
                  );
                })}
              </nav>
            </div>

            <div className="my-auto flex h-9 min-w-0 items-center justify-end gap-2 justify-self-end whitespace-nowrap">
              <Tooltip title={panelOpen ? "收起 Agent" : "打开 Agent"}>
                <Button
                  type="text"
                  shape="circle"
                  className="!h-8 !w-8 !min-w-8"
                  icon={<Bot className="size-4" />}
                  onClick={togglePanel}
                  aria-label="打开 Agent"
                />
              </Tooltip>
              <UserStatusActions />
              {user ? (
                <>
                  <Tooltip title={user.username}>
                    <Avatar
                      className="!size-8 !bg-foreground !text-background"
                      icon={<User className="size-4" />}
                    >
                      {user.username.slice(0, 1).toUpperCase()}
                    </Avatar>
                  </Tooltip>
                  <Button
                    size="small"
                    onClick={() => {
                      logout();
                      navigate("/login");
                    }}
                  >
                    退出
                  </Button>
                </>
              ) : (
                <Button size="small" onClick={() => navigate("/login")}>
                  登录
                </Button>
              )}
            </div>
          </div>
        </header>
      ) : null}

      <MobileNavDrawer
        open={mobileNavOpen}
        activeToolSlug={activeToolSlug}
        onClose={() => setMobileNavOpen(false)}
      />
      <AppConfigModal />
    </>
  );
}
