// Command ourmod is the OurMod desktop app: a Fyne GUI for loading a cheat
// table, attaching to whichever platform it declares is actually running,
// and toggling features. See cmd/ourmod-cli for the scriptable equivalent
// used for testing a table against a real game before it's trusted here.
package main

import "github.com/Official-Husko/ourmod/internal/app/ourmod/ui"

func main() {
	ui.Run()
}
