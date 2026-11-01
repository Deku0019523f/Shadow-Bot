# Commandes de Shadow Bot

189 commandes — généré par `node scripts/docs.js`. Préfixe par défaut : `.`

## audio

| Commande | Description |
|---|---|
| `avec` | Audio → vidéo (forme d'onde) |
| `bass` | Modifie les graves d'un audio (bass 10) |
| `black` | Audio → vidéo à fond noir |
| `cut` | Extrait un passage audio (cut début;durée en secondes) |
| `histo` | Audio → vidéo avec histogramme |
| `low` | Voix plus grave |
| `mp3` _(audio, toaudio)_ | Vidéo → audio MP3, ou audio → note vocale |
| `pitch` | Voix plus aiguë |
| `reverse` | Lit une vidéo ou un audio à l'envers |
| `treble` | Modifie les aigus d'un audio (treble 10) |
| `vector` | Audio → vidéo avec vectorscope |

## bot

| Commande | Description |
|---|---|
| `allvar` | Liste toutes les variables (valeurs sensibles masquées) — _propriétaire_ |
| `backup` | Sauvegarde des réglages : backup now · backup restore (répondre au fichier) — _propriétaire_ |
| `delvar` | Supprime une variable (delvar CLE) — _propriétaire_ |
| `dyno` _(sysinfo)_ | État du serveur (uptime, mémoire, version) — _propriétaire_ |
| `gauth` | Connexion Google : gauth auth · code <url> · import · status · logout — _propriétaire_ |
| `getvar` | Affiche une variable (getvar CLE) — _propriétaire_ |
| `gupload` | Google Drive : gupload (répondre à un média) · list · get n · del n — _propriétaire_ |
| `mode` | Mode du bot : mode public \| private — _propriétaire_ |
| `plugin` | Installe un plugin depuis un Gist/raw GitHub (plugin lien) · plugin list — _propriétaire_ |
| `remove` | Supprime un plugin externe (remove nom · remove all) — _propriétaire_ |
| `restart` _(reboot)_ | Redémarre le bot (nécessite PM2, Docker, Render… qui relance le processus) — _propriétaire_ |
| `setprefix` | Change le préfixe (setprefix ! · setprefix off pour aucun) — _propriétaire_ |
| `setvar` | Définit une variable (setvar CLE = valeur ; ex : setvar GEMINI_API_KEY = …) — _propriétaire_ |
| `shutdown` | Arrête le bot (avec PM2 : pm2 stop ; sinon le processus se termine) — _propriétaire_ |
| `tog` | Active/désactive une commande du bot (tog ping off) — _propriétaire_ |
| `update` | Vérifie les mises à jour git (update) · installe et redémarre (update now) — _propriétaire_ |

## budget

| Commande | Description |
|---|---|
| `budget` | Saisie en langage naturel (budget j'ai dépensé 50 pour le café) |
| `delbudget` | Supprime une ligne du budget (delbudget id — id visible dans summary) |
| `expense` | Enregistre un dépense (expense type,montant,remarque) |
| `income` | Enregistre un revenu (income type,montant,remarque) |
| `summary` | Résumé du budget (summary — mois en cours · summary 2026-10 · summary 01/10/2026,31/10/2026) |

## compte

| Commande | Description |
|---|---|
| `afk` | Mode absent (afk raison — #lastseen = durée) · afk off — _propriétaire_ |
| `block` | Bloque un contact — _propriétaire_ |
| `call` | Rejette automatiquement les appels (call on \| off) — _propriétaire_ |
| `cinfo` | Infos d'une chaîne WhatsApp (cinfo lien) |
| `clear` | Vide la conversation (clear ou clear jid) — _propriétaire_ |
| `creact` | Réagit à un post de chaîne (creact lien-du-post, ❣) — _propriétaire_ |
| `delcmd` | Supprime l'association d'un sticker (répondre au sticker) ou d'une commande (delcmd ping) — _propriétaire_ |
| `dlt` | Supprime le message cité |
| `forward` | Transfère le message cité (forward jid, jid…) — _propriétaire_ |
| `fullpp` | Photo de profil sans recadrage (répondre à une image) — _propriétaire_ |
| `getcmd` | Liste les commandes associées à des stickers — _propriétaire_ |
| `gjid` | Liste des groupes du bot avec leurs JID — _propriétaire_ |
| `jid` | JID du chat, du membre mentionné ou de la personne citée |
| `left` | Le bot quitte le groupe (left message d'adieu) — _propriétaire, groupe_ |
| `online` | Reste toujours en ligne (online on \| off) — _propriétaire_ |
| `pp` | Change la photo de profil du bot (répondre à une image) — _propriétaire_ |
| `react` | Réagit au message cité (react ❣) — _propriétaire_ |
| `read` | Lecture auto des messages (read on \| off \| p \| g \| jid \| ignore jid) — _propriétaire_ |
| `save` | Enregistre le message cité dans votre propre chat — _propriétaire_ |
| `scstatus` | Programme un statut (scstatus jid,jid\|min-heure-jour-mois · scstatus list) — _propriétaire_ |
| `setcmd` | Associe un sticker à une commande (répondre au sticker : setcmd ping) — _propriétaire_ |
| `setstatus` | Publie un statut (répondre à un texte/image/vidéo : setstatus jid,jid \| setstatus contact) — _propriétaire_ |
| `status` | Vue auto des statuts (status on \| off \| no-dl \| except-view jid \| only-view jid) — _propriétaire_ |
| `unblock` | Débloque un contact — _propriétaire_ |

## divers

| Commande | Description |
|---|---|
| `avm` | Fusionne un audio et une vidéo (répondre à chacun, puis avm) |
| `whois` | Infos sur un membre ou un groupe (whois @membre \| whois jid-groupe) |

## document

| Commande | Description |
|---|---|
| `page` | Ajoute une image comme page n d'un PDF (page 1) |
| `pdf` | Génère le PDF à partir des pages ajoutées (pdf titre) |

## groupe

| Commande | Description |
|---|---|
| `add` | Ajoute des numéros au groupe (ex: add 2250700000000) — _admin, groupe_ |
| `amute` | Fermeture automatique quotidienne du groupe (amute 21 30 \| info \| on \| off) — _admin, groupe_ |
| `antifake` | Filtre les numéros par indicatif pays : on/off, allow/disallow/remove/list/clear — _admin, groupe_ |
| `antigm` | Anti mention de groupe : on/off, delete\|warn\|kick, ignore <jid> — _propriétaire_ |
| `antigstatus` | Anti statut de groupe : on/off, ignore/unignore <jid>, list, clear — _propriétaire_ |
| `antilink` | Anti-lien : on/off, kick\|warn\|null, allow/disallow/list/clear — _admin, groupe_ |
| `antispam` | Protection anti-spam : on/off/low/medium/high/warn/delete/kick/info — _admin, groupe_ |
| `antiword` | Filtre de mots interdits : on/off, kick\|warn\|null, add/remove/list/clear — _admin, groupe_ |
| `aunmute` | Ouverture automatique quotidienne du groupe (aunmute 21 30 \| info \| on \| off) — _admin, groupe_ |
| `close` | Seuls les admins peuvent écrire — _admin, groupe_ |
| `common` | Membres communs à plusieurs groupes (kick / kickall / any / skip) — _admin, groupe_ |
| `demote` | Retire le statut admin — _admin, groupe_ |
| `ginfo` | Infos d'un groupe à partir de son lien d'invitation |
| `goodbye` | Au revoir : message automatique (goodbye <texte> \| on \| off \| delete) — _admin, groupe_ |
| `gpp` | Change l'icône du groupe (en réponse à une image) — _admin, groupe_ |
| `gstatus` | Statut de groupe (expérimental) : répondre à un texte/image/vidéo (gstatus ou gstatus jid-groupe) — _propriétaire_ |
| `hidetag` | Notifie tout le monde sans afficher les mentions — _admin, groupe_ |
| `inactive` | Liste/expulse les inactifs (inactive day 10 total 50 kick) — _admin, groupe_ |
| `join` | Fait rejoindre un groupe au bot via un lien (propriétaire) — _propriétaire_ |
| `kick` | Expulse des membres (mention/réponse) — "kick all" expulse tous les non-admins — _admin, groupe_ |
| `link` _(invite)_ | Donne le lien d'invitation du groupe — _admin, groupe_ |
| `msgs` | Nombre de messages par membre (msgs @membre pour un seul) — _groupe_ |
| `mute` | Ferme le groupe (mute 30 = pendant 30 minutes) — _admin, groupe_ |
| `open` | Tout le monde peut écrire — _admin, groupe_ |
| `pdm` | Alerte quand un membre est promu/rétrogradé admin (pdm on \| off) — _admin, groupe_ |
| `promote` | Nomme des membres admins — _admin, groupe_ |
| `reset` | Remet à zéro les compteurs (reset all \| reset @membre) — _admin, groupe_ |
| `revoke` | Réinitialise le lien d'invitation du groupe — _admin, groupe_ |
| `tag` | Mentionne des membres : tag all \| admin \| notadmin \| <texte> (ou en réponse à un message) — _admin, groupe_ |
| `tagall` | Mentionne tous les membres — _admin, groupe_ |
| `unmute` | Rouvre le groupe — _admin, groupe_ |
| `vote` | Lance un vote : vote q\|Question ⏎ o\|😀\|Option … (vote delete pour supprimer) — _groupe_ |
| `warn` | Avertit un membre (warn @user raison) — "warn reset @user" remet à zéro — _admin, groupe_ |
| `warns` | Affiche les avertissements d'un membre — _groupe_ |
| `welcome` | Bienvenue : message automatique (welcome <texte> \| on \| off \| delete) — _admin, groupe_ |

## général

| Commande | Description |
|---|---|
| `alive` | Vérifie que le bot fonctionne |
| `list` | Liste compacte de toutes les commandes |
| `menu` _(help, aide)_ | Affiche la liste des commandes |
| `ping` | Mesure la latence du bot |

## ia

| Commande | Description |
|---|---|
| `bing` | Question avec recherche web en direct (bing qui a gagné le dernier match ?) |
| `dall` | Génère une image par IA (dall un chat siamois en studio) |
| `gemini` | Discuter avec Google Gemini (image possible : répondre à une image) |
| `gpt` | Discuter avec ChatGPT (image possible : répondre à une image) |
| `groq` | Discuter avec Groq |
| `lydia` | Chatbot IA : lydia on\|off (tout le chat) · lydia on @membre |
| `or` | Discuter avec OpenRouter |

## images

| Commande | Description |
|---|---|
| `bloody` | Effet photo « bloody » par IA (répondre à une image) |
| `bokeh` | Effet photo « bokeh » par IA (répondre à une image) |
| `cartoon` | Effet photo « cartoon » par IA (répondre à une image) |
| `color` | Effet photo « color » par IA (répondre à une image) |
| `dark` | Effet photo « dark » par IA (répondre à une image) |
| `demon` | Effet photo « demon » par IA (répondre à une image) |
| `enhance` | Effet photo « enhance » par IA (répondre à une image) |
| `gandm` | Effet photo « gandm » par IA (répondre à une image) |
| `horned` | Effet photo « horned » par IA (répondre à une image) |
| `kiss` | Effet photo « kiss » par IA (répondre à une image) |
| `look` | Effet photo « look » par IA (répondre à une image) |
| `makeup` | Effet photo « makeup » par IA (répondre à une image) |
| `pencil` | Effet photo « pencil » par IA (répondre à une image) |
| `rmbg` _(removebg)_ | Supprime l'arrière-plan d'une image (répondre à une image) |
| `sketch` | Effet photo « sketch » par IA (répondre à une image) |
| `skull` | Effet photo « skull » par IA (répondre à une image) |
| `wanted` | Effet photo « wanted » par IA (répondre à une image) |
| `zombie` | Effet photo « zombie » par IA (répondre à une image) |

## jeux

| Commande | Description |
|---|---|
| `ttt` _(tictactoe, morpion)_ | Morpion : ttt @membre [infini] · ttt end — _groupe_ |
| `wcg` | Chaîne de mots (wcg [facile\|difficile] · wcg end) — _groupe_ |
| `wrg` | Mot à lettre aléatoire (wrg [facile\|difficile] · wrg end) — _groupe_ |

## logia

| Commande | Description |
|---|---|
| `ope` | Retire des commandes autorisées (ope ping sticker · ope all) — _propriétaire_ |
| `yami` | Liste des commandes autorisées dans ce chat — _propriétaire_ |
| `zushi` | Autorise des commandes pour tous dans ce chat (zushi ping sticker) — _propriétaire_ |

## organisation

| Commande | Description |
|---|---|
| `delschedule` | Supprime des messages programmés (delschedule jid,heure · delschedule jid · delschedule all) — _propriétaire_ |
| `getschedule` | Messages programmés (getschedule ou getschedule jid) — _propriétaire_ |
| `reminder` _(rappel)_ | Rappel (reminder demain à 10h réunion · reminder list · reminder del 1) |
| `setschedule` | Programme un message (répondre au message : setschedule demain à 10h) — _propriétaire_ |
| `task` _(tasks)_ | Google Tasks (task list \| add texte \| del n \| done n \| update n texte \| list-lists \| list-switch nom) — _propriétaire_ |

## outils

| Commande | Description |
|---|---|
| `fancy` | Polices stylisées (fancy texte = liste ; fancy 5 en répondant à un texte) |
| `fullss` | Capture d'écran de la page entière |
| `ison` | Vérifie si des numéros sont sur WhatsApp (ison 2250700000000, …) |
| `qr` | Crée un QR code (qr texte) ou lit un QR code (répondre à une image) |
| `ss` | Capture d'écran d'un site (ss exemple.com) |
| `trt` | Traduction (trt en en répondant à un texte · trt fr Hello) |
| `tts` | Texte → voix (tts Bonjour {fr}) |
| `upload` | Envoie le média d'un lien direct (upload https://…/fichier.mp4) |
| `url` _(tourl)_ | Héberge un média et donne son lien (répondre à un média) |

## perso

| Commande | Description |
|---|---|
| `delgreet` | Supprime le message d'accueil privé — _propriétaire_ |
| `getgreet` | Affiche le message d'accueil privé — _propriétaire_ |
| `mention` | Réponse automatique quand on vous mentionne (mention <message> \| on \| off \| get) — _propriétaire_ |
| `setgreet` | Définit le message d'accueil privé — _propriétaire_ |

## recherche

| Commande | Description |
|---|---|
| `img` | Recherche d'images (img chat,3) |
| `movie` _(film)_ | Infos sur un film ou une série (movie Titre) |
| `news` _(actu)_ | Dernières actualités (news ou news sujet) |
| `pinterest` _(pin)_ | Images Pinterest (pinterest mot-clé,3) ou téléchargement d'un pin (lien) |
| `weather` _(meteo, météo)_ | Météo d'une ville (weather Abidjan) |

## réponses auto

| Commande | Description |
|---|---|
| `filter` | Réponse automatique à un mot (filter salut, en répondant à un texte) — filter list — _admin, groupe_ |
| `gfilter` | Réponse automatique dans tous les groupes (gfilter salut, en répondant à un texte \| gfilter list) — _propriétaire_ |
| `gstop` | Supprime un gfilter (gstop salut) — _propriétaire_ |
| `pfilter` | Réponse automatique dans tous les chats privés (pfilter salut, en répondant à un texte \| pfilter list) — _propriétaire_ |
| `pstop` | Supprime un pfilter (pstop salut) — _propriétaire_ |
| `stop` | Supprime un filtre du groupe (stop salut) — _admin, groupe_ |

## sticker

| Commande | Description |
|---|---|
| `circle` | Image → sticker rond |
| `exif` | Pack/auteur par défaut des stickers (exif pack;auteur) — _propriétaire_ |
| `mp4` _(togif, tovideo)_ | Sticker animé → vidéo MP4 |
| `photo` | Sticker → image |
| `scrop` | Image → sticker recadré (carré) |
| `sticker` _(s)_ | Image/vidéo/GIF → sticker (répondre au média) |
| `take` | Change pack et auteur d'un sticker (take pack;auteur) |

## téléchargement

| Commande | Description |
|---|---|
| `apk` | Télécharge une application Android (apk Mixplorer) |
| `fb` _(facebook)_ | Télécharge une vidéo Facebook |
| `insta` _(ig, instagram)_ | Télécharge une vidéo Instagram (posts, reels, vidéos) |
| `mediafire` _(mf)_ | Télécharge un fichier Mediafire (mediafire lien) |
| `reddit` | Télécharge la vidéo d'un post Reddit (reddit lien) |
| `song` _(play)_ | Télécharge une chanson YouTube en MP3 (song nom ou lien) |
| `spotify` | Télécharge un titre Spotify (spotify lien) — via YouTube |
| `story` | Stories Instagram d'un compte (story pseudo) |
| `tiktok` _(tt)_ | Télécharge une vidéo TikTok (sans filigrane quand disponible) |
| `twitter` _(x)_ | Télécharge une vidéo Twitter / X |
| `video` | Télécharge une vidéo YouTube (video nom ou lien) |
| `yta` | Audio YouTube par lien (yta lien) |
| `ytlogin` | Cookies pour yt-dlp : répondre à un fichier cookies.txt · ytlogin status · ytlogin logout — _propriétaire_ |
| `yts` | Recherche sur YouTube (yts baymax) |
| `ytv` | Vidéo YouTube par lien (ytv lien[,qualité] ex : ytv lien,480) |

## vidéo

| Commande | Description |
|---|---|
| `compress` | Compresse une vidéo |
| `crop` | Recadre une vidéo (crop largeur,hauteur,x,y) |
| `merge` | Assemble des vidéos (merge 1, merge 2… puis merge) |
| `rotate` | Pivote une vidéo (rotate right\|left\|flip) |
| `trim` | Coupe une vidéo (trim début;durée en secondes) |

## whatsapp

| Commande | Description |
|---|---|
| `antiedit` | Anti-edit : affiche l'historique des messages modifiés (g \| p \| jid \| off) — _propriétaire_ |
| `delete` | Anti-suppression : récupère les messages supprimés (delete g \| p \| jid \| off) — _propriétaire_ |
| `poll` | Crée un sondage WhatsApp : poll question,option1,option2,… — _propriétaire_ |

