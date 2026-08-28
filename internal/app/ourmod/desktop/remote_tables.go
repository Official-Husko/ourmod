package desktop

import (
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"time"

	"github.com/Official-Husko/ourmod/pkg/cheats"
)

// This project's own repo doubles as the default shared table registry -
// tables/*.yml there is exactly the same format this app already reads
// locally, so "syncing" is just "download whichever files are missing or
// declare a newer metadata.version than what's on disk already". Matches
// the repo URL already shown in NavRail/AboutView.
const (
	remoteTablesOwner  = "Official-Husko"
	remoteTablesRepo   = "ourmod"
	remoteTablesBranch = "main"
	remoteTablesPath   = "tables"
)

// githubContentEntry is the subset of GitHub's contents-API response this
// needs. DownloadURL points at raw.githubusercontent.com, so fetching it
// doesn't count against the API's (much lower) rate limit - only the one
// listing call does.
type githubContentEntry struct {
	Name        string `json:"name"`
	Type        string `json:"type"`
	DownloadURL string `json:"download_url"`
}

// TableSyncResult reports what SyncTables actually did with each remote
// file, by game name, so the frontend can show a real summary instead of
// a bare success/fail toast.
type TableSyncResult struct {
	Added   []string `json:"added"`
	Updated []string `json:"updated"`
	Skipped []string `json:"skipped"` // local version >= remote; left untouched
	Failed  []string `json:"failed"`  // "<file>: <reason>"
}

// SyncTables fetches every table under tables/ in this project's own
// GitHub repo and reconciles it against the local tables/ folder:
//   - missing locally -> downloaded and added
//   - exists locally, remote metadata.version is strictly higher -> local
//     file is overwritten with the remote copy
//   - exists locally, remote version is equal or lower -> left untouched
//
// This never deletes a local file, including one with no remote
// counterpart at all (e.g. a table you made yourself) - sync only ever
// adds or upgrades. The version gate is also what keeps it safe to run
// against a table you're actively hand-editing: your local copy only
// loses to a remote one once you've actually bumped its version past what
// you're editing, never before.
func (a *App) SyncTables() (TableSyncResult, error) {
	result := TableSyncResult{}
	client := &http.Client{Timeout: 10 * time.Second}

	entries, err := fetchTableEntries(client)
	if err != nil {
		return result, err
	}

	if err := os.MkdirAll("tables", 0o755); err != nil {
		return result, fmt.Errorf("tables sync: %w", err)
	}

	for _, entry := range entries {
		if entry.Type != "file" || filepath.Ext(entry.Name) != ".yml" {
			continue
		}
		syncOneTable(client, entry, &result)
	}

	return result, nil
}

func syncOneTable(client *http.Client, entry githubContentEntry, result *TableSyncResult) {
	remoteData, err := fetchRaw(client, entry.DownloadURL)
	if err != nil {
		result.Failed = append(result.Failed, fmt.Sprintf("%s: %v", entry.Name, err))
		return
	}

	remoteTable, err := cheats.Parse(remoteData, entry.Name)
	if err != nil {
		result.Failed = append(result.Failed, fmt.Sprintf("%s: %v", entry.Name, err))
		return
	}

	localPath := filepath.Join("tables", entry.Name)
	localData, err := os.ReadFile(localPath)
	if err != nil {
		// No local copy at all - a genuinely new table, always worth adding.
		if err := os.WriteFile(localPath, remoteData, 0o644); err != nil {
			result.Failed = append(result.Failed, fmt.Sprintf("%s: %v", entry.Name, err))
			return
		}
		result.Added = append(result.Added, remoteTable.Metadata.Name)
		return
	}

	localTable, err := cheats.Parse(localData, localPath)
	if err != nil {
		// Local file doesn't even parse; a remote copy that does is
		// strictly better than what's there now.
		if err := os.WriteFile(localPath, remoteData, 0o644); err != nil {
			result.Failed = append(result.Failed, fmt.Sprintf("%s: %v", entry.Name, err))
			return
		}
		result.Updated = append(result.Updated, remoteTable.Metadata.Name)
		return
	}

	if cheats.CompareVersions(remoteTable.Metadata.Version, localTable.Metadata.Version) > 0 {
		if err := os.WriteFile(localPath, remoteData, 0o644); err != nil {
			result.Failed = append(result.Failed, fmt.Sprintf("%s: %v", entry.Name, err))
			return
		}
		result.Updated = append(result.Updated, remoteTable.Metadata.Name)
		return
	}

	result.Skipped = append(result.Skipped, remoteTable.Metadata.Name)
}

func fetchTableEntries(client *http.Client) ([]githubContentEntry, error) {
	url := fmt.Sprintf(
		"https://api.github.com/repos/%s/%s/contents/%s?ref=%s",
		remoteTablesOwner, remoteTablesRepo, remoteTablesPath, remoteTablesBranch,
	)

	req, err := http.NewRequest(http.MethodGet, url, nil)
	if err != nil {
		return nil, err
	}
	req.Header.Set("Accept", "application/vnd.github+json")

	resp, err := client.Do(req)
	if err != nil {
		return nil, fmt.Errorf("tables sync: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("tables sync: listing tables/: HTTP %d", resp.StatusCode)
	}

	var entries []githubContentEntry
	if err := json.NewDecoder(resp.Body).Decode(&entries); err != nil {
		return nil, fmt.Errorf("tables sync: decode listing: %w", err)
	}
	return entries, nil
}

func fetchRaw(client *http.Client, url string) ([]byte, error) {
	resp, err := client.Get(url)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("HTTP %d", resp.StatusCode)
	}
	return io.ReadAll(resp.Body)
}
