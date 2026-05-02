import { Plugin, registerPlugin, getPlugins } from 'enmity/managers/plugins';
import { getByProps } from 'enmity/metro';
import { React, Toasts, Clipboard } from 'enmity/metro/common';
import { create } from 'enmity/patcher';
import { FormRow, FormSection, TextInput, View } from 'enmity/components';
import { get, set } from 'enmity/api/settings';
import manifest from '../manifest.json';

const Patcher = create('PluginSync');
const ID = 'PluginSync';

const s = {
    urls: (): Record<string, string> => { try { return JSON.parse(get(ID, 'urls', '{}') || '{}'); } catch { return {}; } },
    setUrls: (d: Record<string, string>) => { try { set(ID, 'urls', JSON.stringify(d)); } catch {} },
    token: (): string => get(ID, 'ghToken', '') as string,
    gistId: (): string => get(ID, 'gistId', '') as string,
};

// GitHub Gist API
const GIST_FILENAME = 'pluginsync.json';
const gistHeaders = (token: string) => ({
    'Authorization': `token ${token}`,
    'Content-Type': 'application/json',
    'User-Agent': 'PluginSync-Enmity',
});

const gistSave = (token: string, gistId: string, data: string): Promise<string> => {
    if (gistId) {
        return fetch(`https://api.github.com/gists/${gistId}`, {
            method: 'PATCH',
            headers: gistHeaders(token),
            body: JSON.stringify({ files: { [GIST_FILENAME]: { content: data } } }),
        }).then((r: any) => r.json()).then((r: any) => r.id ?? gistId);
    }
    return fetch('https://api.github.com/gists', {
        method: 'POST',
        headers: gistHeaders(token),
        body: JSON.stringify({
            description: 'PluginSync Enmity Backup',
            public: false,
            files: { [GIST_FILENAME]: { content: data } },
        }),
    }).then((r: any) => r.json()).then((r: any) => r.id ?? '');
};

const gistLoad = (token: string, gistId: string): Promise<string> =>
    fetch(`https://api.github.com/gists/${gistId}`, { headers: gistHeaders(token) })
        .then((r: any) => r.json())
        .then((r: any) => r.files?.[GIST_FILENAME]?.content ?? '');

const PluginSync: Plugin = {
    ...manifest,
    onStart() {},
    onStop() { Patcher.unpatchAll(); },

    getSettingsPanel({ settings: _ }: { settings: any }) {
        const Panel = () => {
            const { ScrollView } = getByProps('ScrollView') ?? { ScrollView: View };
            const [token, setToken] = React.useState(s.token());
            const [gistId, setGistId] = React.useState(s.gistId());
            const [installUrl, setInstallUrl] = React.useState('');
            const [status, setStatus] = React.useState('');
            const [busy, setBusy] = React.useState(false);

            const plugins = getPlugins() ?? [];
            const urls = s.urls();

            const getUrl = (p: any): string => p?.url ?? p?.manifest?.url ?? urls[p?.name] ?? '';

            const handleInstall = () => {
                const url = installUrl.trim();
                if (!url.startsWith('http')) { Toasts.open({ content: 'Geçerli bir URL gir!' }); return; }
                const ep = (window as any).enmity?.plugins;
                const name = url.split('/').pop()?.replace(/\.js$/i, '') ?? '';
                ep?.installPlugin?.(url, (res: any) => {
                    if (res?.kind === 'success' || res === true) {
                        if (name) {
                            const u = s.urls();
                            u[name] = url;
                            s.setUrls(u);
                        }
                        setInstallUrl('');
                        setStatus(`✓ ${name} kuruldu ve URL kaydedildi`);
                        Toasts.open({ content: `${name || 'Plugin'} kuruldu ve kaydedildi!` });
                    } else {
                        Toasts.open({ content: 'Kurulum başarısız!' });
                    }
                });
            };

            const buildData = () => JSON.stringify({
                version: 1,
                savedAt: new Date().toISOString(),
                plugins: plugins.map((p: any) => ({
                    name: p.name,
                    version: p.version,
                    url: getUrl(p),
                })),
            }, null, 2);

            const handleSaveSettings = () => {
                set(ID, 'ghToken', token.trim());
                set(ID, 'gistId', gistId.trim());
                Toasts.open({ content: 'Ayarlar kaydedildi!' });
            };

            const handleCloudSave = () => {
                const t = token.trim();
                if (!t) { Toasts.open({ content: 'Önce GitHub token gir!' }); return; }
                setBusy(true);
                gistSave(t, gistId.trim(), buildData())
                    .then((id: string) => {
                        if (id) { set(ID, 'gistId', id); setGistId(id); }
                        setStatus(`Kaydedildi · Gist: ${id}`);
                        Toasts.open({ content: "Buluta kaydedildi!" });
                        setBusy(false);
                    })
                    .catch(() => { Toasts.open({ content: 'Bulut kaydetme hatası!' }); setBusy(false); });
            };

            const doImport = (text: string) => {
                try {
                    const data = JSON.parse(text);
                    if (!Array.isArray(data?.plugins)) { Toasts.open({ content: 'Geçersiz format!' }); return; }
                    const ep = (window as any).enmity?.plugins;
                    const newUrls = s.urls();
                    let queued = 0, skipped = 0;
                    data.plugins.forEach((p: any) => {
                        const url: string = typeof p === 'string' ? p : p?.url;
                        const name: string = typeof p === 'object' ? (p?.name ?? '') : '';
                        if (!url) { skipped++; return; }
                        queued++;
                        if (name) newUrls[name] = url;
                        try { ep?.installPlugin?.(url, () => {}); } catch {}
                    });
                    s.setUrls(newUrls);
                    setStatus(`${queued} plugin yükleniyor${skipped > 0 ? ` · ${skipped} atlandı` : ''}`);
                    Toasts.open({ content: `${queued} plugin yükleniyor...` });
                } catch { Toasts.open({ content: 'JSON okunamadı!' }); }
            };

            const handleCloudLoad = () => {
                const t = token.trim();
                const g = gistId.trim();
                if (!t || !g) { Toasts.open({ content: 'Token ve Gist ID gerekli!' }); return; }
                setBusy(true);
                gistLoad(t, g)
                    .then((content: string) => {
                        doImport(content);
                        setBusy(false);
                    })
                    .catch(() => { Toasts.open({ content: 'Gist yüklenemedi!' }); setBusy(false); });
            };

            const handleLocalSave = () => {
                const data = buildData();
                const Share = getByProps('share', 'sharedAction');
                if (Share?.share) {
                    Share.share({ message: data, title: 'PluginSync.json' })
                        .then(() => setStatus(`Cihaza kaydedildi (${plugins.length} plugin)`))
                        .catch(() => { Clipboard.setString(data); Toasts.open({ content: 'Panoya kopyalandı!' }); });
                } else {
                    Clipboard.setString(data);
                    Toasts.open({ content: 'Panoya kopyalandı!' });
                }
            };

            const handleLocalLoad = () => {
                const DocPicker = getByProps('pickSingle', 'pick') ?? getByProps('pick', 'pickDirectory');
                const pickFn = DocPicker?.pickSingle
                    ?? (DocPicker?.pick ? (...a: any[]) => DocPicker.pick(...a).then((r: any[]) => r[0]) : null);
                if (pickFn) {
                    pickFn({ type: ['public.json', 'public.text', '*/*'] })
                        .then((r: any) => fetch(r?.uri ?? r?.fileCopyUri ?? ''))
                        .then((r: any) => r.text())
                        .then(doImport)
                        .catch(() => Toasts.open({ content: 'Dosya okunamadı!' }));
                } else {
                    Clipboard.getString().then(doImport);
                }
            };

            const withUrl = plugins.filter((p: any) => !!getUrl(p)).length;

            return React.createElement(ScrollView, { style: { flex: 1, marginBottom: 20 } },
                React.createElement(FormSection, { title: 'GENEL DURUM' },
                    React.createElement(FormRow, {
                        label: `${plugins.length} Plugin · ${withUrl}/${plugins.length} Kayıtlı`,
                        subLabel: status || 'Sistem hazır',
                    })
                ),
                React.createElement(FormSection, { title: 'YENİ PLUGİN KUR' },
                    React.createElement(View, { style: { paddingHorizontal: 16, paddingTop: 8 } },
                        React.createElement(TextInput, {
                            value: installUrl,
                            onChangeText: setInstallUrl,
                            placeholder: 'Plugin URL\'sini buraya yapıştır',
                            placeholderTextColor: '#72767d',
                            style: { color: '#fff', backgroundColor: '#2f3136', borderRadius: 8, padding: 10, fontSize: 13, marginBottom: 4 },
                            autoCapitalize: 'none', autoCorrect: false,
                        })
                    ),
                    React.createElement(FormRow, {
                        label: 'Kur ve Kaydet',
                        subLabel: 'URL kalıcı olarak eklenecek',
                        onPress: handleInstall,
                    })
                ),
                React.createElement(FormSection, { title: 'BULUT YEDEKLEME (GITHUB)' },
                    React.createElement(View, { style: { paddingHorizontal: 16, paddingTop: 8 } },
                        React.createElement(TextInput, {
                            value: token,
                            onChangeText: setToken,
                            placeholder: 'GitHub Personal Access Token (gist izni)',
                            placeholderTextColor: '#72767d',
                            secureTextEntry: true,
                            style: { color: '#fff', backgroundColor: '#2f3136', borderRadius: 8, padding: 10, fontSize: 13, marginBottom: 6 },
                            autoCapitalize: 'none', autoCorrect: false,
                        }),
                        React.createElement(TextInput, {
                            value: gistId,
                            onChangeText: setGistId,
                            placeholder: 'Gist ID (ilk yedeklemede otomatik dolar)',
                            placeholderTextColor: '#72767d',
                            style: { color: '#fff', backgroundColor: '#2f3136', borderRadius: 8, padding: 10, fontSize: 13, marginBottom: 4 },
                            autoCapitalize: 'none', autoCorrect: false,
                        })
                    ),
                    React.createElement(FormRow, { label: "Bağlantı Ayarlarını Kaydet", onPress: handleSaveSettings }),
                    React.createElement(FormRow, { label: busy ? 'İşleniyor...' : "Buluta Yedekle", onPress: busy ? undefined : handleCloudSave }),
                    React.createElement(FormRow, { label: busy ? 'İşleniyor...' : "Buluttan Geri Yükle", onPress: busy ? undefined : handleCloudLoad })
                ),
                React.createElement(FormSection, { title: 'CİHAZ İÇİ YEDEKLEME' },
                    React.createElement(FormRow, {
                        label: 'Dosyaya Kaydet',
                        subLabel: 'JSON dosyası olarak dışa aktar',
                        onPress: handleLocalSave,
                    }),
                    React.createElement(FormRow, {
                        label: 'Dosyadan Yükle',
                        subLabel: 'Cihazdaki JSON dosyasından içe aktar',
                        onPress: handleLocalLoad,
                    })
                ),
                React.createElement(FormSection, { title: `YÜKLÜ PLUGİNLER (${plugins.length})` },
                    ...plugins.map((p: any) =>
                        React.createElement(FormRow, {
                            key: p.name,
                            label: p.name,
                            subLabel: `v${p.version} · ${getUrl(p) ? 'Kayıtlı' : 'URL Eksik'}`,
                        })
                    )
                )
            );
        };
        return React.createElement(Panel, null);
    },
};

registerPlugin(PluginSync);
