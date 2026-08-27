package ui

import (
	"image/color"

	"fyne.io/fyne/v2"
	"fyne.io/fyne/v2/theme"
)

// ourmodTheme is a dark, green-accented theme approximating the design
// mockup's terminal aesthetic: Fyne is a native GL-rendered toolkit, not a
// CSS engine, so effects like the mockup's text glow, scanline overlay, and
// exact grid spacing aren't reproducible here - this covers what is (colors
// and an all-monospace type style).
type ourmodTheme struct{}

var _ fyne.Theme = (*ourmodTheme)(nil)

var (
	colorBackground = color.NRGBA{R: 0x0a, G: 0x0c, B: 0x0b, A: 0xff}
	colorForeground = color.NRGBA{R: 0xdf, G: 0xfb, B: 0xec, A: 0xff}
	colorAccent     = color.NRGBA{R: 0x7e, G: 0xf0, B: 0xb0, A: 0xff}
	colorSurface    = color.NRGBA{R: 0x12, G: 0x18, B: 0x15, A: 0xff}
	colorBorder     = color.NRGBA{R: 0x1c, G: 0x24, B: 0x20, A: 0xff}
	colorDisabled   = color.NRGBA{R: 0x55, G: 0x63, B: 0x5c, A: 0xff}
	colorWarning    = color.NRGBA{R: 0xff, G: 0xcf, B: 0x6b, A: 0xff}
	colorError      = color.NRGBA{R: 0xff, G: 0x9b, B: 0x9b, A: 0xff}
)

func (ourmodTheme) Color(name fyne.ThemeColorName, _ fyne.ThemeVariant) color.Color {
	switch name {
	case theme.ColorNameBackground:
		return colorBackground
	case theme.ColorNameForeground:
		return colorForeground
	case theme.ColorNamePrimary:
		return colorAccent
	case theme.ColorNameButton, theme.ColorNameInputBackground, theme.ColorNameMenuBackground, theme.ColorNameDisabledButton:
		return colorSurface
	case theme.ColorNameDisabled:
		return colorDisabled
	case theme.ColorNameSuccess:
		return colorAccent
	case theme.ColorNameWarning:
		return colorWarning
	case theme.ColorNameError:
		return colorError
	case theme.ColorNameSeparator, theme.ColorNameInputBorder, theme.ColorNameShadow:
		return colorBorder
	case theme.ColorNameHover, theme.ColorNameSelection:
		return color.NRGBA{R: 0x7e, G: 0xf0, B: 0xb0, A: 0x22}
	}
	return theme.DefaultTheme().Color(name, theme.VariantDark)
}

func (ourmodTheme) Icon(name fyne.ThemeIconName) fyne.Resource {
	return theme.DefaultTheme().Icon(name)
}

// Font forces every text style to render monospace, matching the mockup's
// all-monospace look, since no IBM Plex Mono asset is bundled here (the
// only local copy found belongs to an unrelated game install, and fetching
// one wasn't asked for) - Fyne's bundled monospace face stands in for it.
func (ourmodTheme) Font(style fyne.TextStyle) fyne.Resource {
	style.Monospace = true
	return theme.DefaultTheme().Font(style)
}

func (ourmodTheme) Size(name fyne.ThemeSizeName) float32 {
	return theme.DefaultTheme().Size(name)
}
