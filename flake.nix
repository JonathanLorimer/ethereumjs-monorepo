{
  description = "GIMME A SHELL";

  inputs = {
    nixpkgs.url = github:nixos/nixpkgs/nixpkgs-unstable;
    flake-utils.url = github:numtide/flake-utils;
  };

  outputs = {nixpkgs, flake-utils, ...}:
    flake-utils.lib.eachDefaultSystem (system:
      let
        pkgs = import nixpkgs {inherit system;};
      in rec {
        devShells.default =
          pkgs.mkShell {
            name = "ethereumjs-shell";

            buildInputs = with pkgs; [
              nodejs-18_x
              yarn
              nodePackages.npm
            ];

            shellHook = with pkgs; "${pkgs.yarn}/bin/yarn";
          };
      });
}
