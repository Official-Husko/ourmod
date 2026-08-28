package main

import (
	"bufio"
	"flag"
	"fmt"
	"os"
	"os/signal"
	"path/filepath"
	"strings"
	"syscall"

	"github.com/Official-Husko/ourmod/internal/app/ourmod/engine"
	"github.com/Official-Husko/ourmod/pkg/cheats"
)

func main() {
	tablePath := flag.String("table", "", "path to a cheat table YAML file (see tables/)")
	featureName := flag.String("feature", "", "feature to enable")
	flag.Parse()

	if *tablePath == "" {
		fatal(fmt.Errorf("-table is required; available: %s", listTables()))
	}

	table, err := cheats.LoadFile(*tablePath)
	fatalOn(err)

	if *featureName == "" {
		fatal(fmt.Errorf("-feature is required; available in %s: %s", table.Metadata.Name, listFeatures(table)))
	}

	feature, err := table.Find(*featureName)
	fatalOn(err)

	// Try every platform this table declares; use whichever one actually
	// has a process running. A table with only "linux", only "windows", or
	// both, all work unmodified - nothing here assumes a specific platform.
	plat, pid, err := engine.FindRunningPlatform(table.Metadata.Platforms)
	fatalOn(err)
	fmt.Printf("game PID: %d (%s)\n", pid, plat)

	target, ok := feature.Targets[plat]
	if !ok {
		fatal(fmt.Errorf("feature %q has no %s target", feature.Name, plat))
	}
	executable := table.Metadata.Platforms[plat].Executable

	maps, err := engine.ReadMaps(pid)
	fatalOn(err)

	base, err := engine.FindModuleBase(maps, executable)
	fatalOn(err)
	fmt.Printf("module base: %#x\n", base)

	imageSize, err := engine.ReadPEImageSize(pid, base)
	fatalOn(err)
	fmt.Printf("PE image size: %#x\n", imageSize)

	site, err := engine.Resolve(pid, maps, base, imageSize, target.Signature)
	fatalOn(err)
	fmt.Printf("feature target:  %#x\n", site)
	fmt.Printf("target RVA:      %#x\n", site-base)

	session := engine.NewSession(pid, maps)
	fatalOn(session.Enable(feature, target, site))

	if entry, ok := session.Snapshot()[feature.Name]; ok && entry.Cave != 0 {
		fmt.Printf("code cave:       %#x\n", entry.Cave)
	}

	fmt.Printf("\n%s enabled.\n", feature.Name)
	fmt.Println("Press Enter to restore it and exit (Ctrl+C also restores).")

	sigCh := make(chan os.Signal, 1)
	signal.Notify(sigCh, syscall.SIGINT, syscall.SIGTERM)

	enterCh := make(chan struct{})
	go func() {
		_, _ = bufio.NewReader(os.Stdin).ReadString('\n')
		close(enterCh)
	}()

	select {
	case <-enterCh:
	case sig := <-sigCh:
		fmt.Printf("\nreceived %s, restoring...\n", sig)
	}

	if err := session.DisableAll(); err != nil {
		fmt.Fprintf(os.Stderr, "restore failed: %v\n", err)
		os.Exit(1)
	}

	fmt.Println("restored")
}

func listTables() string {
	matches, _ := filepath.Glob("tables/*.yml")
	if len(matches) == 0 {
		return "(none found under tables/)"
	}
	return strings.Join(matches, ", ")
}

func listFeatures(t *cheats.CheatTable) string {
	names := make([]string, len(t.Features))
	for i, f := range t.Features {
		names[i] = f.Name
	}
	return strings.Join(names, ", ")
}

func fatalOn(err error) {
	if err != nil {
		fatal(err)
	}
}

func fatal(err error) {
	fmt.Fprintln(os.Stderr, "error:", err)
	os.Exit(1)
}
