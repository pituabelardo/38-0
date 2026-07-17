/* ============================================================================
   PLANTILLAZO — DATOS DE EJEMPLO  (data-demo.js)
   ----------------------------------------------------------------------------
   ⚠️  TODO ESTE MÓDULO ES DEMO. El dataset real de LaLiga (2000-01 → 2025-26)
   está EN PAUSA por decisión de Jorge. Estos datos sirven para que el juego sea
   JUGABLE ya. Cuando llegue el dataset real, NO se toca la UI: solo se cambia la
   implementación de data.js para que lea de Supabase (pl_squads / pl_squad_members
   / pl_players) en vez de este objeto.

   Estructura (espejo de las tablas pl_*):
   - teams[]   : { id, name, shortName, slug, colorPrimary }   ~ pl_teams
   - players[] : { id, fullName, alias, aka, nationality, position } ~ pl_players
   - squads[]  : { id, teamId, season, members:[{ playerId, matches, minutes, goals }] }
                 ~ pl_squads + pl_squad_members

   Los minutos/partidos son APROXIMADOS y solo para alimentar el marcador de
   rareza (menos minutos/notoriedad esa temporada => más rareza). No son cifras
   oficiales: en producción vendrán validadas a doble fuente.

   9 plantillas demo:
     barca-1516, madrid-1112, atletico-1314, valencia-0102, sevilla-0607,
     depor-9900-ish(2003-04 campeón? -> usamos 2003-04 Valencia ya hay; metemos
     Villarreal 2005-06), betis, villarreal-0506, athletic-8384? (mantenemos era
     moderna). Lista final abajo.
   ============================================================================ */

/* ---- EQUIPOS (nombre + color, SIN escudos: regla legal de la spec) ---- */
const DEMO_TEAMS = [
  { id: 1, name: 'FC Barcelona',   shortName: 'Barça',     slug: 'fc-barcelona',  colorPrimary: '#A50044' },
  { id: 2, name: 'Real Madrid',    shortName: 'Madrid',    slug: 'real-madrid',   colorPrimary: '#1E2A55' },
  { id: 3, name: 'Atlético de Madrid', shortName: 'Atleti', slug: 'atletico-madrid', colorPrimary: '#CB3524' },
  { id: 4, name: 'Valencia CF',    shortName: 'Valencia',  slug: 'valencia-cf',   colorPrimary: '#EE3524' },
  { id: 5, name: 'Sevilla FC',     shortName: 'Sevilla',   slug: 'sevilla-fc',    colorPrimary: '#D81E29' },
  { id: 6, name: 'Villarreal CF',  shortName: 'Villarreal',slug: 'villarreal-cf', colorPrimary: '#FFE667' },
  { id: 7, name: 'Real Betis',     shortName: 'Betis',     slug: 'real-betis',    colorPrimary: '#00954C' },
  { id: 8, name: 'Athletic Club',  shortName: 'Athletic',  slug: 'athletic-club', colorPrimary: '#C8102E' },
  { id: 9, name: 'Deportivo de La Coruña', shortName: 'Dépor', slug: 'deportivo', colorPrimary: '#1C50A1' },
];

/* ---- JUGADORES (identidad estable por id) ----
   aka: apodo MUY marcado (ej. Pepe). alias: nombre de camiseta.            */
let _pid = 0; const P = (o) => ({ id: ++_pid, alias: '', aka: '', nationality: '', position: '', ...o });

const DEMO_PLAYERS = [
  /* --- Barça 2015-16 --- */
  P({ fullName:'Lionel Messi', position:'DEL', nationality:'ARG' }),                 // 1
  P({ fullName:'Andrés Iniesta', position:'MED', nationality:'ESP' }),               // 2
  P({ fullName:'Sergio Busquets', position:'MED', nationality:'ESP' }),              // 3
  P({ fullName:'Gerard Piqué', position:'DEF', nationality:'ESP' }),                 // 4
  P({ fullName:'Luis Suárez', position:'DEL', nationality:'URU' }),                  // 5
  P({ fullName:'Neymar da Silva Santos Júnior', alias:'Neymar Jr', position:'DEL', nationality:'BRA' }), // 6
  P({ fullName:'Ivan Rakitić', position:'MED', nationality:'CRO' }),                 // 7
  P({ fullName:'Jordi Alba', position:'DEF', nationality:'ESP' }),                   // 8
  P({ fullName:'Marc-André ter Stegen', position:'POR', nationality:'GER' }),        // 9
  P({ fullName:'Claudio Bravo', position:'POR', nationality:'CHI' }),                // 10
  P({ fullName:'Javier Mascherano', position:'DEF', nationality:'ARG' }),            // 11
  P({ fullName:'Sergi Roberto', position:'MED', nationality:'ESP' }),                // 12
  P({ fullName:'Aleix Vidal', position:'DEF', nationality:'ESP' }),                  // 13
  P({ fullName:'Arda Turan', position:'MED', nationality:'TUR' }),                   // 14
  P({ fullName:'Dani Alves', alias:'Dani Alves', position:'DEF', nationality:'BRA' }),// 15
  P({ fullName:'Thomas Vermaelen', position:'DEF', nationality:'BEL' }),             // 16
  P({ fullName:'Jérémy Mathieu', position:'DEF', nationality:'FRA' }),               // 17
  P({ fullName:'Munir El Haddadi', position:'DEL', nationality:'ESP' }),             // 18
  P({ fullName:'Sandro Ramírez', position:'DEL', nationality:'ESP' }),               // 19
  P({ fullName:'Adriano Correia', alias:'Adriano', position:'DEF', nationality:'BRA' }), // 20
  P({ fullName:'Douglas Pereira', alias:'Douglas', position:'DEF', nationality:'BRA' }),  // 21

  /* --- Real Madrid 2011-12 (campeón de Mourinho) --- */
  P({ fullName:'Iker Casillas', position:'POR', nationality:'ESP' }),                // 22
  P({ fullName:'Cristiano Ronaldo', position:'DEL', nationality:'POR' }),            // 23
  P({ fullName:'Sergio Ramos', position:'DEF', nationality:'ESP' }),                 // 24
  P({ fullName:'Xabi Alonso', position:'MED', nationality:'ESP' }),                  // 25
  P({ fullName:'Mesut Özil', position:'MED', nationality:'GER' }),                   // 26
  P({ fullName:'Karim Benzema', position:'DEL', nationality:'FRA' }),                // 27
  P({ fullName:'Ángel Di María', position:'MED', nationality:'ARG' }),              // 28
  P({ fullName:'Marcelo Vieira', alias:'Marcelo', position:'DEF', nationality:'BRA' }),// 29
  P({ fullName:'Képler Laveran Lima Ferreira', alias:'Pepe', aka:'Pepe', position:'DEF', nationality:'POR' }), // alias de camiseta + aka muy marcado
  P({ fullName:'Gonzalo Higuaín', position:'DEL', nationality:'ARG' }),
  P({ fullName:'Kaká', fullNameLong:'Ricardo Izecson dos Santos Leite', position:'MED', nationality:'BRA' }), // 33
  P({ fullName:'Fábio Coentrão', position:'DEF', nationality:'POR' }),               // 34
  P({ fullName:'Raphaël Varane', position:'DEF', nationality:'FRA' }),               // 35
  P({ fullName:'Álvaro Arbeloa', position:'DEF', nationality:'ESP' }),               // 36
  P({ fullName:'Ricardo Carvalho', position:'DEF', nationality:'POR' }),             // 37
  P({ fullName:'Hamit Altıntop', position:'MED', nationality:'TUR' }),               // 38
  P({ fullName:'Nuri Şahin', position:'MED', nationality:'TUR' }),                   // 39
  P({ fullName:'Esteban Granero', position:'MED', nationality:'ESP' }),              // 40
  P({ fullName:'José Callejón', position:'DEL', nationality:'ESP' }),                // 41
  P({ fullName:'Antonio Adán', position:'POR', nationality:'ESP' }),                 // 42

  /* --- Atlético de Madrid 2013-14 (campeón de Simeone) --- */
  P({ fullName:'Thibaut Courtois', position:'POR', nationality:'BEL' }),             // 43
  P({ fullName:'Diego Godín', position:'DEF', nationality:'URU' }),                  // 44
  P({ fullName:'Diego Costa', position:'DEL', nationality:'ESP' }),                  // 45
  P({ fullName:'Koke', fullNameLong:'Jorge Resurrección Merodio', position:'MED', nationality:'ESP' }), // 46
  P({ fullName:'Arda Turan', position:'MED', nationality:'TUR', dupRef:14 }),         // 47 (mismo Arda, otra época) -> usamos 14 en squad
  P({ fullName:'Gabi', fullNameLong:'Gabriel Fernández Arenas', position:'MED', nationality:'ESP' }), // 48
  P({ fullName:'Filipe Luís', position:'DEF', nationality:'BRA' }),                  // 49
  P({ fullName:'Juanfran', fullNameLong:'Juan Francisco Torres', position:'DEF', nationality:'ESP' }), // 50
  P({ fullName:'Raúl García', position:'MED', nationality:'ESP' }),                  // 51
  P({ fullName:'David Villa', position:'DEL', nationality:'ESP' }),                  // 52
  P({ fullName:'Adrián López', position:'DEL', nationality:'ESP' }),                 // 53
  P({ fullName:'Miranda', fullNameLong:'João Miranda de Souza', position:'DEF', nationality:'BRA' }), // 54
  P({ fullName:'Mario Suárez', position:'MED', nationality:'ESP' }),                 // 55
  P({ fullName:'Cristian Rodríguez', position:'MED', nationality:'URU' }),           // 56
  P({ fullName:'Toby Alderweireld', position:'DEF', nationality:'BEL' }),            // 57
  P({ fullName:'José Sosa', position:'MED', nationality:'ARG' }),                    // 58
  P({ fullName:'Diego Ribas', alias:'Diego', position:'MED', nationality:'BRA' }),   // 59
  P({ fullName:'Leo Baptistão', position:'DEL', nationality:'ESP' }),               // 60
  P({ fullName:'Daniel Aranzubia', position:'POR', nationality:'ESP' }),             // 61

  /* --- Valencia CF 2001-02 (campeón de Rafa Benítez) --- */
  P({ fullName:'Santiago Cañizares', position:'POR', nationality:'ESP' }),           // 62
  P({ fullName:'Rubén Baraja', position:'MED', nationality:'ESP' }),                 // 63
  P({ fullName:'David Albelda', position:'MED', nationality:'ESP' }),                // 64
  P({ fullName:'Pablo Aimar', position:'MED', nationality:'ARG' }),                  // 65
  P({ fullName:'Vicente Rodríguez', alias:'Vicente', position:'DEL', nationality:'ESP' }), // 66
  P({ fullName:'Rubén Baraja', position:'MED', dupRef:63 }), // dup ignorado
  P({ fullName:'Mista', fullNameLong:'Miguel Ángel Ferrer', position:'DEL', nationality:'ESP' }), // 68
  P({ fullName:'John Carew', position:'DEL', nationality:'NOR' }),                   // 69
  P({ fullName:'Roberto Ayala', position:'DEF', nationality:'ARG' }),                // 70
  P({ fullName:'Amedeo Carboni', position:'DEF', nationality:'ITA' }),               // 71
  P({ fullName:'Mauricio Pellegrino', position:'DEF', nationality:'ARG' }),          // 72
  P({ fullName:'Curro Torres', position:'DEF', nationality:'ESP' }),                 // 73
  P({ fullName:'Fabián Ayala', position:'DEF', dupRef:70 }), // dup ignorado
  P({ fullName:'Kily González', position:'MED', nationality:'ARG' }),               // 75
  P({ fullName:'Adrian Ilie', position:'DEL', nationality:'ROU' }),                  // 76
  P({ fullName:'Salva Ballesta', position:'DEL', nationality:'ESP' }),               // 77
  P({ fullName:'Fabio Aurelio', position:'DEF', nationality:'BRA' }),                // 78
  P({ fullName:'Francisco Rufete', position:'MED', nationality:'ESP' }),             // 79

  /* --- Sevilla FC 2006-07 (UEFA + Copa) --- */
  P({ fullName:'Andrés Palop', position:'POR', nationality:'ESP' }),                 // 80
  P({ fullName:'Dani Alves', position:'DEF', dupRef:15 }), // dup ignorado (Alves estuvo en Sevilla)
  P({ fullName:'Frédéric Kanouté', position:'DEL', nationality:'MLI' }),             // 82
  P({ fullName:'Luís Fabiano', position:'DEL', nationality:'BRA' }),                 // 83
  P({ fullName:'Jesús Navas', position:'MED', nationality:'ESP' }),                  // 84
  P({ fullName:'Enzo Maresca', position:'MED', nationality:'ITA' }),                 // 85
  P({ fullName:'Christian Poulsen', position:'MED', nationality:'DEN' }),            // 86
  P({ fullName:'Adriano Correia', position:'DEF', dupRef:20 }), // dup ignorado (Adriano jugó en Sevilla)
  P({ fullName:'Ivica Dragutinović', position:'DEF', nationality:'SRB' }),           // 88
  P({ fullName:'Julien Escudé', position:'DEF', nationality:'FRA' }),                // 89
  P({ fullName:'Aitor Ocio', position:'DEF', nationality:'ESP' }),                   // 90
  P({ fullName:'Renato', fullNameLong:'Renato Dirnei Florêncio Santos', position:'MED', nationality:'BRA' }), // 91
  P({ fullName:'Seydou Keita', position:'MED', nationality:'MLI' }),                 // 92
  P({ fullName:'Andrés Palop', position:'POR', dupRef:80 }), // dup
  P({ fullName:'Javi Navarro', position:'DEF', nationality:'ESP' }),                 // 94
  P({ fullName:'Alejandro Alfaro', position:'MED', nationality:'ESP' }),             // 95

  /* --- Villarreal CF 2005-06 (semifinal Liga de Campeones) --- */
  P({ fullName:'Juan Román Riquelme', position:'MED', nationality:'ARG' }),          // 96
  P({ fullName:'Diego Forlán', position:'DEL', nationality:'URU' }),                 // 97
  P({ fullName:'Marcos Senna', position:'MED', nationality:'ESP' }),                 // 98
  P({ fullName:'Juan Pablo Sorín', position:'DEF', nationality:'ARG' }),             // 99
  P({ fullName:'Sebastián Battaglia', position:'MED', nationality:'ARG' }),          // 100
  P({ fullName:'Quique Álvarez', position:'DEF', nationality:'ESP' }),               // 101
  P({ fullName:'Rodolfo Arruabarrena', position:'DEF', nationality:'ARG' }),         // 102
  P({ fullName:'Gonzalo Rodríguez', position:'DEF', nationality:'ARG' }),            // 103
  P({ fullName:'Josico', fullNameLong:'José Joaquín Moreno', position:'MED', nationality:'ESP' }), // 104
  P({ fullName:'Sebastián Viera', position:'POR', nationality:'URU' }),              // 105
  P({ fullName:'José Manuel Pinto', position:'POR', nationality:'ESP' }),            // 106
  P({ fullName:'Guillermo Franco', position:'DEL', nationality:'MEX' }),             // 107
  P({ fullName:'Javi Venta', position:'DEF', nationality:'ESP' }),                   // 108

  /* --- Real Betis 2021-22 (campeón de Copa) --- */
  P({ fullName:'Nabil Fekir', position:'MED', nationality:'FRA' }),                  // 109
  P({ fullName:'Sergio Canales', position:'MED', nationality:'ESP' }),               // 110
  P({ fullName:'Borja Iglesias', position:'DEL', nationality:'ESP' }),               // 111
  P({ fullName:'Joaquín Sánchez', alias:'Joaquín', position:'MED', nationality:'ESP' }), // 112
  P({ fullName:'Guido Rodríguez', position:'MED', nationality:'ARG' }),              // 113
  P({ fullName:'Claudio Bravo', position:'POR', dupRef:10 }), // dup (Bravo jugó en Betis)
  P({ fullName:'Germán Pezzella', position:'DEF', nationality:'ARG' }),              // 115
  P({ fullName:'Marc Bartra', position:'DEF', nationality:'ESP' }),                  // 116
  P({ fullName:'Álex Moreno', position:'DEF', nationality:'ESP' }),                  // 117
  P({ fullName:'Héctor Bellerín', position:'DEF', nationality:'ESP' }),              // 118
  P({ fullName:'Juanmi', fullNameLong:'Juan Miguel Jiménez', position:'DEL', nationality:'ESP' }), // 119
  P({ fullName:'Cristian Tello', position:'DEL', nationality:'ESP' }),               // 120
  P({ fullName:'William Carvalho', position:'MED', nationality:'POR' }),             // 121
  P({ fullName:'Andrés Guardado', position:'MED', nationality:'MEX' }),              // 122
  P({ fullName:'Víctor Camarasa', position:'MED', nationality:'ESP' }),              // 123

  /* --- Deportivo de La Coruña 2003-04 (semifinal Liga de Campeones, "Superdépor") --- */
  P({ fullName:'Juan Carlos Valerón', position:'MED', nationality:'ESP' }),          // 124
  P({ fullName:'Diego Tristán', position:'DEL', nationality:'ESP' }),                // 125
  P({ fullName:'Roy Makaay', position:'DEL', nationality:'NED' }),                   // 126 (ojo: 03-04 ya se fue, lo dejamos como secundario raro? mejor quitar)
  P({ fullName:'Walter Pandiani', position:'DEL', nationality:'URU' }),              // 127
  P({ fullName:'Sergio González', position:'MED', nationality:'ESP' }),              // 128
  P({ fullName:'Aldo Duscher', position:'MED', nationality:'ARG' }),                 // 129
  P({ fullName:'Mauro Silva', position:'MED', nationality:'BRA' }),                  // 130
  P({ fullName:'Fran', fullNameLong:'Francisco Javier González', position:'MED', nationality:'ESP' }), // 131
  P({ fullName:'Jorge Andrade', position:'DEF', nationality:'POR' }),                // 132
  P({ fullName:'Enrique Romero', position:'DEF', nationality:'ESP' }),               // 133
  P({ fullName:'Lionel Scaloni', position:'DEF', nationality:'ARG' }),               // 134
  P({ fullName:'Francisco Molina', alias:'Molina', position:'POR', nationality:'ESP' }), // 135
  P({ fullName:'Albert Luque', position:'DEL', nationality:'ESP' }),                 // 136
  P({ fullName:'Víctor Sánchez', position:'MED', nationality:'ESP' }),               // 137
  P({ fullName:'Joan Capdevila', position:'DEF', nationality:'ESP' }),               // 138

  /* --- Athletic Club 2020-21 (doble final de Copa) --- */
  P({ fullName:'Unai Simón', position:'POR', nationality:'ESP' }),                   // 139
  P({ fullName:'Iker Muniain', position:'MED', nationality:'ESP' }),                 // 140
  P({ fullName:'Iñaki Williams', position:'DEL', nationality:'ESP' }),               // 141
  P({ fullName:'Raúl García', position:'MED', dupRef:51 }), // dup (Raúl García en Athletic)
  P({ fullName:'Yeray Álvarez', position:'DEF', nationality:'ESP' }),                // 143
  P({ fullName:'Óscar de Marcos', position:'DEF', nationality:'ESP' }),              // 144
  P({ fullName:'Yuri Berchiche', position:'DEF', nationality:'ESP' }),               // 145
  P({ fullName:'Dani García', position:'MED', nationality:'ESP' }),                  // 146
  P({ fullName:'Unai López', position:'MED', nationality:'ESP' }),                   // 147
  P({ fullName:'Alex Berenguer', position:'DEL', nationality:'ESP' }),               // 148
  P({ fullName:'Asier Villalibre', position:'DEL', nationality:'ESP' }),             // 149
  P({ fullName:'Iñigo Martínez', position:'DEF', nationality:'ESP' }),               // 150
  P({ fullName:'Mikel Vesga', position:'MED', nationality:'ESP' }),                  // 151
  P({ fullName:'Jon Morcillo', position:'DEL', nationality:'ESP' }),                 // 152
];

/* helper: encuentra player por nombre (por fullName o alias) para construir
   squads sin recontar ids. Si no encuentra, avisa pero NO rompe la carga.      */
function pid(name){
  let p = DEMO_PLAYERS.find(x => x.fullName === name && !x.dupRef);
  if(!p) p = DEMO_PLAYERS.find(x => x.alias === name && !x.dupRef);
  if(!p){ console.warn('[Plantillazo DEMO] jugador no encontrado, se omite del squad:', name); return null; }
  return p.id;
}

/* ---- PLANTILLAS (squad-temporada) con minutos/partidos/goles aprox ----
   m = matches (PJ), min = minutos, g = goles. Alimentan la rareza:
   menos min/notoriedad => más raro.                                        */
const DEMO_SQUADS = [
  {
    id: 101, slug: 'barca-1516', teamId: 1, season: '2015-16', members: [
      { name:'Lionel Messi', m:33, min:2760, g:26 },
      { name:'Luis Suárez', m:35, min:3120, g:40 },
      { name:'Neymar da Silva Santos Júnior', m:34, min:2890, g:24 },
      { name:'Andrés Iniesta', m:25, min:1780, g:1 },
      { name:'Sergio Busquets', m:33, min:2880, g:0 },
      { name:'Ivan Rakitić', m:34, min:2650, g:5 },
      { name:'Gerard Piqué', m:30, min:2610, g:1 },
      { name:'Jordi Alba', m:30, min:2540, g:2 },
      { name:'Javier Mascherano', m:29, min:2480, g:0 },
      { name:'Marc-André ter Stegen', m:11, min:990, g:0 },
      { name:'Claudio Bravo', m:27, min:2430, g:0 },
      { name:'Dani Alves', m:25, min:1990, g:1 },
      { name:'Sergi Roberto', m:30, min:1820, g:3 },
      { name:'Jérémy Mathieu', m:21, min:1640, g:1 },
      { name:'Arda Turan', m:21, min:980, g:6 },
      { name:'Aleix Vidal', m:8, min:340, g:0 },
      { name:'Thomas Vermaelen', m:8, min:560, g:0 },
      { name:'Adriano Correia', m:9, min:520, g:0 },
      { name:'Munir El Haddadi', m:6, min:210, g:1 },
      { name:'Sandro Ramírez', m:14, min:430, g:4 },
      { name:'Douglas Pereira', m:3, min:120, g:0 },
    ]
  },
  {
    id: 102, slug: 'madrid-1112', teamId: 2, season: '2011-12', members: [
      { name:'Cristiano Ronaldo', m:38, min:3380, g:46 },
      { name:'Iker Casillas', m:38, min:3420, g:0 },
      { name:'Sergio Ramos', m:34, min:3010, g:3 },
      { name:'Xabi Alonso', m:35, min:3050, g:3 },
      { name:'Mesut Özil', m:35, min:2730, g:4 },
      { name:'Karim Benzema', m:34, min:2510, g:21 },
      { name:'Ángel Di María', m:33, min:2240, g:5 },
      { name:'Marcelo Vieira', m:33, min:2680, g:2 },
      { name:'Képler Laveran Lima Ferreira', m:31, min:2620, g:2 },
      { name:'Gonzalo Higuaín', m:35, min:1980, g:22 },
      { name:'Kaká', m:27, min:1120, g:5 },
      { name:'Fábio Coentrão', m:28, min:1990, g:1 },
      { name:'Álvaro Arbeloa', m:30, min:2510, g:0 },
      { name:'Ricardo Carvalho', m:18, min:1480, g:0 },
      { name:'Raphaël Varane', m:11, min:610, g:2 },
      { name:'Hamit Altıntop', m:11, min:420, g:0 },
      { name:'Nuri Şahin', m:14, min:520, g:1 },
      { name:'Esteban Granero', m:24, min:980, g:2 },
      { name:'José Callejón', m:23, min:760, g:4 },
      { name:'Antonio Adán', m:1, min:90, g:0 },
    ]
  },
  {
    id: 103, slug: 'atletico-1314', teamId: 3, season: '2013-14', members: [
      { name:'Diego Costa', m:35, min:2870, g:27 },
      { name:'Thibaut Courtois', m:37, min:3330, g:0 },
      { name:'Diego Godín', m:35, min:3060, g:4 },
      { name:'Koke', m:35, min:2900, g:8 },
      { name:'Gabi', m:37, min:3280, g:2 },
      { name:'Arda Turan', m:31, min:2360, g:4 },
      { name:'Filipe Luís', m:32, min:2780, g:1 },
      { name:'Juanfran', m:35, min:3050, g:1 },
      { name:'Raúl García', m:36, min:2410, g:7 },
      { name:'David Villa', m:36, min:2210, g:13 },
      { name:'Adrián López', m:30, min:1480, g:8 },
      { name:'Miranda', m:30, min:2630, g:2 },
      { name:'Mario Suárez', m:30, min:1980, g:1 },
      { name:'Cristian Rodríguez', m:31, min:1640, g:4 },
      { name:'Toby Alderweireld', m:13, min:780, g:1 },
      { name:'José Sosa', m:18, min:610, g:1 },
      { name:'Diego Ribas', m:14, min:520, g:1 },
      { name:'Leo Baptistão', m:13, min:340, g:1 },
      { name:'Daniel Aranzubia', m:1, min:90, g:0 },
    ]
  },
  {
    id: 104, slug: 'valencia-0102', teamId: 4, season: '2001-02', members: [
      { name:'Santiago Cañizares', m:33, min:2970, g:0 },
      { name:'Rubén Baraja', m:31, min:2680, g:8 },
      { name:'David Albelda', m:33, min:2890, g:1 },
      { name:'Pablo Aimar', m:28, min:2150, g:5 },
      { name:'Vicente Rodríguez', m:32, min:2480, g:5 },
      { name:'Mista', m:30, min:1820, g:9 },
      { name:'John Carew', m:31, min:1760, g:8 },
      { name:'Roberto Ayala', m:30, min:2710, g:2 },
      { name:'Amedeo Carboni', m:28, min:2410, g:0 },
      { name:'Mauricio Pellegrino', m:29, min:2520, g:1 },
      { name:'Curro Torres', m:24, min:1680, g:0 },
      { name:'Kily González', m:30, min:2380, g:4 },
      { name:'Adrian Ilie', m:22, min:1120, g:4 },
      { name:'Salva Ballesta', m:24, min:980, g:6 },
      { name:'Fabio Aurelio', m:18, min:1240, g:1 },
      { name:'Francisco Rufete', m:20, min:880, g:2 },
    ]
  },
  {
    id: 105, slug: 'sevilla-0607', teamId: 5, season: '2006-07', members: [
      { name:'Frédéric Kanouté', m:34, min:2780, g:21 },
      { name:'Dani Alves', m:35, min:3060, g:3 },
      { name:'Jesús Navas', m:35, min:2640, g:4 },
      { name:'Luís Fabiano', m:28, min:1980, g:11 },
      { name:'Andrés Palop', m:37, min:3330, g:1 },
      { name:'Enzo Maresca', m:30, min:1980, g:7 },
      { name:'Christian Poulsen', m:33, min:2810, g:1 },
      { name:'Adriano Correia', m:31, min:2540, g:3 },
      { name:'Ivica Dragutinović', m:32, min:2780, g:0 },
      { name:'Julien Escudé', m:29, min:2510, g:2 },
      { name:'Aitor Ocio', m:22, min:1680, g:1 },
      { name:'Renato', m:30, min:1820, g:2 },
      { name:'Seydou Keita', m:24, min:1240, g:2 },
      { name:'Javi Navarro', m:18, min:1380, g:1 },
      { name:'Alejandro Alfaro', m:14, min:480, g:1 },
    ]
  },
  {
    id: 106, slug: 'villarreal-0506', teamId: 6, season: '2005-06', members: [
      { name:'Juan Román Riquelme', m:34, min:2980, g:15 },
      { name:'Diego Forlán', m:36, min:2810, g:12 },
      { name:'Marcos Senna', m:33, min:2790, g:3 },
      { name:'Juan Pablo Sorín', m:30, min:2580, g:2 },
      { name:'Sebastián Battaglia', m:28, min:2140, g:1 },
      { name:'Quique Álvarez', m:31, min:2680, g:0 },
      { name:'Rodolfo Arruabarrena', m:27, min:2310, g:0 },
      { name:'Gonzalo Rodríguez', m:32, min:2820, g:2 },
      { name:'Josico', m:30, min:2410, g:1 },
      { name:'Sebastián Viera', m:14, min:1260, g:0 },
      { name:'José Manuel Pinto', m:24, min:2160, g:0 },
      { name:'Guillermo Franco', m:25, min:1340, g:6 },
      { name:'Javi Venta', m:28, min:2280, g:0 },
    ]
  },
  {
    id: 107, slug: 'betis-2122', teamId: 7, season: '2021-22', members: [
      { name:'Nabil Fekir', m:33, min:2680, g:6 },
      { name:'Sergio Canales', m:35, min:2890, g:8 },
      { name:'Borja Iglesias', m:36, min:2410, g:13 },
      { name:'Joaquín Sánchez', m:26, min:780, g:1 },
      { name:'Guido Rodríguez', m:34, min:2980, g:1 },
      { name:'Claudio Bravo', m:24, min:2160, g:0 },
      { name:'Germán Pezzella', m:21, min:1680, g:1 },
      { name:'Marc Bartra', m:27, min:2280, g:0 },
      { name:'Álex Moreno', m:35, min:3010, g:4 },
      { name:'Héctor Bellerín', m:28, min:2240, g:0 },
      { name:'Juanmi', m:33, min:1980, g:11 },
      { name:'Cristian Tello', m:25, min:980, g:3 },
      { name:'William Carvalho', m:30, min:2310, g:2 },
      { name:'Andrés Guardado', m:22, min:1240, g:0 },
      { name:'Víctor Camarasa', m:11, min:380, g:0 },
    ]
  },
  {
    id: 108, slug: 'depor-0304', teamId: 9, season: '2003-04', members: [
      { name:'Juan Carlos Valerón', m:33, min:2780, g:7 },
      { name:'Diego Tristán', m:28, min:1980, g:9 },
      { name:'Walter Pandiani', m:30, min:1840, g:13 },
      { name:'Sergio González', m:34, min:2810, g:5 },
      { name:'Aldo Duscher', m:31, min:2540, g:2 },
      { name:'Mauro Silva', m:30, min:2620, g:0 },
      { name:'Fran', m:24, min:1480, g:2 },
      { name:'Jorge Andrade', m:32, min:2780, g:1 },
      { name:'Enrique Romero', m:28, min:2410, g:1 },
      { name:'Lionel Scaloni', m:30, min:2580, g:1 },
      { name:'Francisco Molina', m:36, min:3240, g:0 },
      { name:'Albert Luque', m:33, min:2480, g:16 },
      { name:'Víctor Sánchez', m:26, min:1640, g:3 },
      { name:'Joan Capdevila', m:31, min:2710, g:2 },
    ]
  },
  {
    id: 109, slug: 'athletic-2021', teamId: 8, season: '2020-21', members: [
      { name:'Iñaki Williams', m:38, min:3380, g:8 },
      { name:'Iker Muniain', m:34, min:2680, g:6 },
      { name:'Unai Simón', m:37, min:3330, g:0 },
      { name:'Raúl García', m:35, min:2410, g:9 },
      { name:'Yeray Álvarez', m:33, min:2890, g:1 },
      { name:'Óscar de Marcos', m:30, min:2510, g:1 },
      { name:'Yuri Berchiche', m:31, min:2680, g:3 },
      { name:'Dani García', m:32, min:2640, g:1 },
      { name:'Unai López', m:28, min:1640, g:2 },
      { name:'Alex Berenguer', m:35, min:2480, g:6 },
      { name:'Asier Villalibre', m:24, min:780, g:4 },
      { name:'Iñigo Martínez', m:30, min:2610, g:2 },
      { name:'Mikel Vesga', m:22, min:1180, g:1 },
      { name:'Jon Morcillo', m:14, min:420, g:1 },
    ]
  },
];

/* resolver nombres -> playerId al cargar (deja la estructura final lista) */
const DEMO_SQUADS_RESOLVED = DEMO_SQUADS.map(sq => ({
  id: sq.id, slug: sq.slug, teamId: sq.teamId, season: sq.season,
  members: sq.members.map(mb => ({
    playerId: pid(mb.name),
    matches: mb.m, minutes: mb.min, goals: mb.g,
  })).filter(m => m.playerId !== null)
}));

/* Exporta como objeto global (la app no usa bundler en el MVP). */
window.PL_DEMO = {
  teams: DEMO_TEAMS,
  players: DEMO_PLAYERS.filter(p => !p.dupRef),  // sin duplicados de identidad
  squads: DEMO_SQUADS_RESOLVED,
};
