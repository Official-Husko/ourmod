// Command ourmod is the OurMod desktop app: a Wails GUI (Go backend, HTML/
// CSS/JS frontend in frontend/dist) for loading a cheat table, attaching to
// whichever platform it declares is actually running, and toggling
// features. See cmd/ourmod-cli for the scriptable equivalent used for
// testing a table against a real game before it's trusted here.
package main

import (
	"embed"

	"github.com/wailsapp/wails/v2"
	"github.com/wailsapp/wails/v2/pkg/options"
	"github.com/wailsapp/wails/v2/pkg/options/assetserver"

	"github.com/Official-Husko/ourmod/internal/app/ourmod/desktop"
)

//go:embed all:frontend/dist
var assets embed.FS

func main() {
	app := desktop.NewApp()

	err := wails.Run(&options.App{
		Title:  "OurMod",
		Width:  900,
		Height: 640,
		AssetServer: &assetserver.Options{
			Assets: assets,
		},
		BackgroundColour: &options.RGBA{R: 10, G: 12, B: 11, A: 255},
		OnStartup:        app.Startup,
		OnShutdown:       app.Shutdown,
		Bind: []interface{}{
			app,
		},
	})
	if err != nil {
		println("error:", err.Error())
	}
}
