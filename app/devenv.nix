{ pkgs, ... }:

{
  packages = [
    pkgs.nodejs_22
    pkgs.playwright-driver.browsers
  ];

  # Point Playwright at the nixpkgs-built browsers and skip the host-OS
  # validation step (it expects glibc-Linux distros, not NixOS).
  env = {
    PLAYWRIGHT_BROWSERS_PATH = "${pkgs.playwright-driver.browsers}";
    PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD = "1";
    PLAYWRIGHT_SKIP_VALIDATE_HOST_REQUIREMENTS = "true";
  };

  enterShell = ''
    echo "OtterPool app devshell"
    echo "  node:       $(node --version)"
    echo "  playwright: browsers at $PLAYWRIGHT_BROWSERS_PATH"
  '';
}
