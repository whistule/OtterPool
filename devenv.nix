{ pkgs, ... }:

{
  cachix.enable = false;

  packages = [
    pkgs.nodejs_22
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
  };

  enterShell = ''
    echo "OtterPool monorepo devshell"
    echo "  node:       $(node --version)"
    echo "  supabase:   $(supabase --version 2>/dev/null || echo 'n/a')"
    echo "  playwright: browsers at $PLAYWRIGHT_BROWSERS_PATH"
  '';
}
