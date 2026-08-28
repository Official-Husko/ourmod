export namespace desktop {
	
	export class ControlView {
	    kind: string;
	    min?: number;
	    max?: number;
	    step?: number;
	    default?: number;
	    unit?: string;
	    actions?: string[];
	
	    static createFrom(source: any = {}) {
	        return new ControlView(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.kind = source["kind"];
	        this.min = source["min"];
	        this.max = source["max"];
	        this.step = source["step"];
	        this.default = source["default"];
	        this.unit = source["unit"];
	        this.actions = source["actions"];
	    }
	}
	export class FeatureView {
	    name: string;
	    category: string;
	    hotkey: string;
	    stability: string;
	    note: string;
	    available: boolean;
	    active: boolean;
	    control: ControlView;
	
	    static createFrom(source: any = {}) {
	        return new FeatureView(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.name = source["name"];
	        this.category = source["category"];
	        this.hotkey = source["hotkey"];
	        this.stability = source["stability"];
	        this.note = source["note"];
	        this.available = source["available"];
	        this.active = source["active"];
	        this.control = this.convertValues(source["control"], ControlView);
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	export class AttachInfo {
	    attached: boolean;
	    pid: number;
	    platform: string;
	    gameName: string;
	
	    static createFrom(source: any = {}) {
	        return new AttachInfo(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.attached = source["attached"];
	        this.pid = source["pid"];
	        this.platform = source["platform"];
	        this.gameName = source["gameName"];
	    }
	}
	export class TableSummary {
	    path: string;
	    name: string;
	    version: string;
	    checksum: string;
	    featureCount: number;
	    author: string;
	    compatibleVersions: string[];
	
	    static createFrom(source: any = {}) {
	        return new TableSummary(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.path = source["path"];
	        this.name = source["name"];
	        this.version = source["version"];
	        this.checksum = source["checksum"];
	        this.featureCount = source["featureCount"];
	        this.author = source["author"];
	        this.compatibleVersions = source["compatibleVersions"];
	    }
	}
	export class AppStatus {
	    table?: TableSummary;
	    attach?: AttachInfo;
	    features: FeatureView[];
	
	    static createFrom(source: any = {}) {
	        return new AppStatus(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.table = this.convertValues(source["table"], TableSummary);
	        this.attach = this.convertValues(source["attach"], AttachInfo);
	        this.features = this.convertValues(source["features"], FeatureView);
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	
	export class AttachResult {
	    info: AttachInfo;
	    failed: string[];
	
	    static createFrom(source: any = {}) {
	        return new AttachResult(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.info = this.convertValues(source["info"], AttachInfo);
	        this.failed = source["failed"];
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	export class BuildInfo {
	    goVersion: string;
	    os: string;
	    arch: string;
	
	    static createFrom(source: any = {}) {
	        return new BuildInfo(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.goVersion = source["goVersion"];
	        this.os = source["os"];
	        this.arch = source["arch"];
	    }
	}
	
	
	export class ReloadResult {
	    table: TableSummary;
	    features: FeatureView[];
	    reverted: string[];
	
	    static createFrom(source: any = {}) {
	        return new ReloadResult(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.table = this.convertValues(source["table"], TableSummary);
	        this.features = this.convertValues(source["features"], FeatureView);
	        this.reverted = source["reverted"];
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	export class SavedMods {
	    enabled: boolean;
	    features: string[];
	
	    static createFrom(source: any = {}) {
	        return new SavedMods(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.enabled = source["enabled"];
	        this.features = source["features"];
	    }
	}

}

