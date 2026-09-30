{ pkgs, ... }:

{
  cachix.enable = false;

  packages = [
    pkgs.nodejs_24
    pkgs.playwright-driver.browsers
    pkgs.biome
    pkgs.supabase-cli
  ];

  # Point Playwright at the nixpkgs-built browsers and skip the host-OS
  # validation step (it expects glibc-Linux distros, not NixOS).
  env = {
    PLAYWRIGHT_BROWSERS_PATH = "${pkgs.playwright-driver.browsers}";
    PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD = "1";
    PLAYWRIGHT_SKIP_VALIDATE_HOST_REQUIREMENTS = "true";
    # `expo start --web` spawns $BROWSER (or xdg-open) and dies if it's
    # missing, which it is on headless hosts. "none" makes Expo skip it;
    # open the printed URL yourself.
    BROWSER = "none";
  };

  enterShell = ''
    echo "OtterPool monorepo devshell"
    echo "  node:       $(node --version)"
    echo "  supabase:   $(supabase --version 2>/dev/null || echo 'n/a')"
    echo "  playwright: browsers at $PLAYWRIGHT_BROWSERS_PATH"

    # CI has no nix, so it pins these by hand. Warn the moment `devenv update`
    # moves one of them out from under the pin.
    pin() {
      grep -qF "$2" "$DEVENV_ROOT/$3" ||
        echo "  WARNING: $1 is $2 here but $3 pins something else, bump them together"
    }
    pin node "node-version: ${pkgs.nodejs_24.version}" .github/workflows/test.yml
    pin node "node-version: ${pkgs.nodejs_24.version}" .github/workflows/deploy-web.yml
    pin biome "@biomejs/biome@${pkgs.biome.version}" .github/workflows/test.yml
    pin supabase "version: ${pkgs.supabase-cli.version}" .github/workflows/deploy-supabase.yml
    pin playwright '"@playwright/test": "${pkgs.playwright-driver.version}"' apps/mobile/package.json
  '';
}
