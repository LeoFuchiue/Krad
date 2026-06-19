/**
 * KRAD Agência — Instagram Profile Analyzer API
 * Vercel Serverless Function (Node.js)
 * 
 * Versão Otimizada com Métricas Profundas e Gatilhos Estratégicos.
 */

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  try {
    let username = req.query.username || (req.body && req.body.username) || '';
    username = username.trim().replace(/^@/, '');

    if (!username) {
      return res.status(400).json({
        error: 'Por favor, informe o username do Instagram (ex: @allanesfihas.atibaia).'
      });
    }

    const apiKey = process.env.RAPIDAPI_KEY;
    const apiHost = process.env.RAPIDAPI_HOST || 'instagram-scraper-api2.p.rapidapi.com';
    
    if (req.query.debug === '1') {
      return res.status(200).json({
        has_api_key: !!apiKey,
        api_key_preview: apiKey ? `${apiKey.substring(0, 4)}...${apiKey.slice(-4)}` : null,
        api_host: apiHost,
        has_gemini_key: !!process.env.GEMINI_API_KEY,
        node_version: process.version
      });
    }
    
    let profileData = null;
    let isRealData = false;

    // 1. Tentar buscar dados reais do Instagram se a chave de API estiver presente
    if (apiKey) {
      try {
        let response;
        let extUrlFromUserInfo = '';
        if (apiHost.includes('instagram120')) {
          const [profileRes, infoRes] = await Promise.all([
            fetch(`https://${apiHost}/api/instagram/profile`, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'X-RapidAPI-Key': apiKey,
                'X-RapidAPI-Host': apiHost
              },
              body: JSON.stringify({ username: username })
            }),
            fetch(`https://${apiHost}/api/instagram/userInfo`, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'X-RapidAPI-Key': apiKey,
                'X-RapidAPI-Host': apiHost
              },
              body: JSON.stringify({ username: username })
            }).catch(() => null)
          ]);
          
          response = profileRes;
          
          if (infoRes && infoRes.ok) {
            try {
              const infoRaw = await infoRes.json();
              let infoUser = {};
              if (infoRaw) {
                if (infoRaw.result) {
                  if (Array.isArray(infoRaw.result)) {
                    if (infoRaw.result[0]) {
                      infoUser = infoRaw.result[0].user || infoRaw.result[0];
                    }
                  } else {
                    infoUser = infoRaw.result.user || infoRaw.result;
                  }
                } else if (infoRaw.data) {
                  infoUser = infoRaw.data.user || infoRaw.data;
                } else {
                  infoUser = infoRaw;
                }
              }
              extUrlFromUserInfo = infoUser.external_url || infoUser.externalUrl || '';
              if (!extUrlFromUserInfo && infoUser.bio_links && infoUser.bio_links.length > 0) {
                extUrlFromUserInfo = infoUser.bio_links[0].url || infoUser.bio_links[0].lynk_url || '';
              }
            } catch (e) {
              console.error('Erro ao ler link no userInfo:', e.message);
            }
          }
        } else {
          response = await fetch(`https://${apiHost}/v1/info?username_or_id_or_url=${encodeURIComponent(username)}`, {
            method: 'GET',
            headers: {
              'X-RapidAPI-Key': apiKey,
              'X-RapidAPI-Host': apiHost
            }
          });
        }

        if (response.ok) {
          const raw = await response.json();
          
          let data = {};
          if (raw) {
            if (raw.result) {
              if (Array.isArray(raw.result)) {
                data = raw.result[0];
              } else {
                data = raw.result;
              }
            } else if (raw.data) {
              data = raw.data;
            } else {
              data = raw;
            }
          }
          
          const userObj = data.user || data;
          
          const followers = userObj.edge_followed_by?.count || userObj.follower_count || userObj.followers || 0;
          const following = userObj.edge_follow?.count || userObj.following_count || userObj.following || 0;
          const bio = userObj.biography || userObj.bio || '';
          
          let externalUrl = extUrlFromUserInfo || userObj.external_url || userObj.externalUrl || '';
          if (!externalUrl) {
            const bioLinks = userObj.bio_links || [];
            if (bioLinks.length > 0) {
              externalUrl = bioLinks[0].url || bioLinks[0].lynk_url || '';
            }
          }
          
          const postCount = userObj.edge_owner_to_timeline_media?.count || userObj.media_count || userObj.postCount || 0;
          
          profileData = {
            username: userObj.username || username,
            fullName: userObj.full_name || userObj.fullName || username,
            followers: followers,
            following: following,
            bio: bio,
            profilePic: userObj.profile_pic_url_hd || userObj.profile_pic_url || userObj.profilePic || '',
            externalUrl: externalUrl,
            postCount: postCount,
          };

          // Calcular engajamento e métricas a partir dos posts
          let averageLikes = 0;
          let averageComments = 0;
          let recentPosts = userObj.feed?.items || userObj.recent_posts || userObj.edge_owner_to_timeline_media?.edges || data.feed?.items || data.recent_posts || data.edge_owner_to_timeline_media?.edges || [];

          if (recentPosts.length > 0) {
            let totalLikes = 0;
            let totalComments = 0;
            const count = Math.min(recentPosts.length, 12);

            for (let i = 0; i < count; i++) {
              const item = recentPosts[i];
              const post = item.node || item; // node é usado no formato GraphQL edges
              totalLikes += post.edge_liked_by?.count || post.like_count || post.likes || 0;
              totalComments += post.edge_media_to_comment?.count || post.comment_count || post.comments || 0;
            }
            averageLikes = Math.round(totalLikes / count);
            averageComments = Math.round(totalComments / count);
          } else {
            averageLikes = Math.round(profileData.followers * 0.024);
            averageComments = Math.round(averageLikes * 0.08);
          }

          // Métricas derivadas reais/estimadas
          const engagementRate = profileData.followers > 0 
            ? parseFloat((((averageLikes + averageComments) / profileData.followers) * 100).toFixed(2))
            : 0;

          // EM VEZ DE USAR MATH.RANDOM(), USE PROPORÇÕES FIXAS DO MERCADO LOCAL PARA O DIAGNÓSTICO
          const averageSaves = Math.round(averageLikes * 0.08) || 1; // 8% é o padrão real de salvamento de posts bons
          const averageShares = Math.round(averageComments * 1.2) || 1; // Quem comenta muito tende a compartilhar nessa proporção
          
          // Taxa de crescimento mensal estimada baseada no engajamento (sem random)
          const followerGrowthRate = parseFloat((engagementRate * 0.35 + 0.1).toFixed(2));
          
          // Alcance de não-seguidores (Reach Rate) (sem random)
          const reachRateNonFollowers = Math.min(Math.round(25 + (engagementRate * 8)), 90);
          
          // Retenção do Reels (sem random)
          const reelsCompletionRate = Math.min(Math.round(20 + (engagementRate * 5)), 75);

          // CONTADOR REAL DE FORMATOS (Exemplo lógico)
          let reelsCount = 0, carrosselCount = 0;
          recentPosts.forEach(post => {
            if (post.is_reels || post.video_view_count || post.video_views) reelsCount++;
            if (post.carousel_media || post.carousel_media_count) carrosselCount++;
          });
          const bestFormat = reelsCount >= carrosselCount ? 'Reels' : 'Carrossel';

          profileData.averageLikes = averageLikes;
          profileData.averageComments = averageComments;
          profileData.averageSaves = averageSaves;
          profileData.averageShares = averageShares;
          profileData.engagementRate = engagementRate;
          profileData.postsPerMonth = Math.min(Math.round(profileData.postCount / 12) || 6, 18);
          profileData.followerGrowthRate = followerGrowthRate;
          profileData.reachRateNonFollowers = reachRateNonFollowers;
          profileData.reelsCompletionRate = reelsCompletionRate;
          profileData.bestFormat = bestFormat;
          profileData.hasLink = !!profileData.externalUrl;
          profileData.activeHours = 'Quarta e Sexta às 12:00'; // Default para contas reais
          
          isRealData = true;
        }
      } catch (err) {
        console.error('Erro ao buscar dados na RapidAPI:', err.message);
      }
    }

    // 2. Se a API não estiver configurada ou falhar, rodar o Mock determinístico profundo
    if (!profileData) {
      profileData = getDeterministicMockData(username);
      isRealData = false;
    }

    // Calcular score matemático base para orientar o Gemini
    profileData.score = calculateMathematicalScore(profileData);

    // 3. Gerar análise inteligente personalizada com a API do Gemini
    const geminiKey = process.env.GEMINI_API_KEY;
    let audit = null;

    if (geminiKey) {
      try {
        const prompt = `Você é o Diretor de Criação da "krad agência", especialista em posicionamento de marcas premium, tráfego pago local e estratégias de conversão de alto impacto no Instagram.
Analise com máxima autoridade, clareza e realismo comercial o perfil do Instagram @${profileData.username}.

DADOS REAIS DO PERFIL DO CLIENTE:
- Nome: ${profileData.fullName}
- Seguidores: ${profileData.followers.toLocaleString('pt-BR')}
- Taxa de Engajamento Real: ${profileData.engagementRate}% (Benchmark de mercado local: 2.5% a 4.0%)
- Frequência de Postagem: ${profileData.postsPerMonth} posts nos últimos 30 dias (Mínimo recomendado comercialmente: 8 a 12 posts)
- Curtidas Médias: ${profileData.averageLikes} | Comentários Médios: ${profileData.averageComments}
- Proporção de Salvamentos: ${profileData.averageSaves} salvamentos por post (Meta ideal: 10% das curtidas)
- Compartilhamentos Médios: ${profileData.averageShares}
- Melhor Formato da Conta: ${profileData.bestFormat}
- Link na Bio: ${profileData.hasLink ? profileData.externalUrl : 'NÃO POSSUI LINK NA BIO'}
- Texto da Bio: "${profileData.bio}"

INSTRUÇÕES DE ESCRITA (ATITUDE COMERCIAL DE VENDAS):
Você deve estruturar seus comentários de feedback (bio_feedback e content_feedback) divididos estritamente em 3 partes de forma fluida (sem subtítulos ou marcações especiais):
1. [IDENTIFICAÇÃO DA DOR]: Aponte de forma direta, sincera e impactante a principal dor/gargalo encontrada nos dados reais (ex: "Achei essa dor: [...]"). Seja o auditor experiente que diz o que ninguém tem coragem de dizer.
2. [SOLUÇÃO IMEDIATA DE GRAÇA]: Dê uma orientação prática, acionável e gratuita para o cliente aplicar hoje mesmo e resolver/minimizar esse problema (ex: reescrever a bio, fazer um gancho específico de vídeo Reels). Mostre que nós realmente dominamos o assunto.
3. [CTA COMERCIAL DA KRAD]: Faça um convite sutil de vendas indicando que, se ele quiser uma solução profissional, completa e escalável (como landing pages de alta conversão para o link ou produção e edição de vídeos de alto padrão com roteiros de atração), ele deve entrar em contato com a Krad agência.

REGRAS DE RETORNO DO JSON:
Retorne estritamente um objeto JSON com o seguinte formato, sem marcações markdown de código (como \`\`\`json) e sem qualquer texto adicional antes ou depois:
{
  "score": ${profileData.score},
  "bio_feedback": "Sua análise da bio e do link seguindo estritamente as 3 partes (Dor + Solução de Graça + CTA da Krad). Diga o que está errado e dê uma reescrita prática da bio para o nicho dele.",
  "content_feedback": "Sua análise do engajamento e formato seguindo estritamente as 3 partes (Dor + Solução de Graça + CTA da Krad). Dê uma sugestão de roteiro/formato de reels ou post.",
  "tips": [
    "Dica de ouro prática 1 baseada no formato ideal (${profileData.bestFormat})",
    "Dica de ouro prática 2 focada em engajamento ou salvamentos",
    "Dica de ouro prática 3 para funil de captação de clientes locais"
  ],
  "triggers": {
    "noLink": ${!profileData.hasLink},
    "lowFrequency": ${profileData.postsPerMonth < 10},
    "lowEngagement": ${profileData.engagementRate < 2.5},
    "confusingBio": ${profileData.bio.length < 30 || !profileData.bio.includes('\n')}
  }
}`;

        const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${geminiKey}`;
        const geminiResponse = await fetch(geminiUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ parts: [{ text: prompt }] }],
            generationConfig: {
              responseMimeType: "application/json",
              responseSchema: {
                type: "OBJECT",
                properties: {
                  score: { type: "INTEGER" },
                  bio_feedback: { type: "STRING" },
                  content_feedback: { type: "STRING" },
                  tips: {
                    type: "ARRAY",
                    items: { type: "STRING" }
                  },
                  triggers: {
                    type: "OBJECT",
                    properties: {
                      noLink: { type: "BOOLEAN" },
                      lowFrequency: { type: "BOOLEAN" },
                      lowEngagement: { type: "BOOLEAN" },
                      confusingBio: { type: "BOOLEAN" }
                    },
                    required: ["noLink", "lowFrequency", "lowEngagement", "confusingBio"]
                  }
                },
                required: ["score", "bio_feedback", "content_feedback", "tips", "triggers"]
              }
            }
          })
        });

        if (geminiResponse.ok) {
          const geminiRaw = await geminiResponse.json();
          const contentText = geminiRaw.candidates[0].content.parts[0].text;
          audit = JSON.parse(contentText);
        }
      } catch (err) {
        console.error('Erro ao chamar o Gemini API:', err.message);
      }
    }

    // Se o Gemini falhar ou não estiver ativo, usar fallback estruturado
    if (!audit) {
      audit = generateStructuralFallbackAudit(profileData);
    }

    return res.status(200).json({
      success: true,
      realtime: isRealData,
      profile: profileData,
      analysis: audit
    });

  } catch (error) {
    console.error('Erro interno na API:', error.message);
    return res.status(500).json({
      error: 'Ocorreu um erro ao processar a análise do perfil. Tente novamente mais tarde.'
    });
  }
};

/**
 * MOCK DATA GENERATOR - DETERMINÍSTICO PROFUNDO
 */
function getDeterministicMockData(username) {
  const cleanUser = username.toLowerCase().trim();

  // 1. KRAD Agência
  if (cleanUser === 'kradagencia') {
    return {
      username: 'kradagencia',
      fullName: 'krad agência',
      followers: 127,
      following: 89,
      bio: '🚀 Posicionamento & Tráfego Pago para Negócios Locais\n📸 Captação Premium (Gravações no local)\n👇 Conheça nossa agência',
      profilePic: '',
      externalUrl: 'https://krad.com.br',
      postCount: 42,
      averageLikes: 35,
      averageComments: 8,
      averageSaves: 6,
      averageShares: 9,
      engagementRate: 33.86,
      postsPerMonth: 12,
      followerGrowthRate: 15.5,
      reachRateNonFollowers: 85,
      reelsCompletionRate: 68,
      bestFormat: 'Reels',
      hasLink: true,
      activeHours: 'Quarta e Sexta às 18:30'
    };
  }

  // 2. Leo Fuchiue
  if (cleanUser === 'leofuchiue') {
    return {
      username: 'leofuchiue',
      fullName: 'Leo Fuchiue',
      followers: 310,
      following: 420,
      bio: '🧠 Estrategista de Vendas & Negócios Digitais\n💼 Cofundador da @kradagencia\n👇 Fale comigo no direct',
      profilePic: '',
      externalUrl: 'https://krad.com.br',
      postCount: 88,
      averageLikes: 62,
      averageComments: 14,
      averageSaves: 10,
      averageShares: 12,
      engagementRate: 24.52,
      postsPerMonth: 6,
      followerGrowthRate: 4.2,
      reachRateNonFollowers: 72,
      reelsCompletionRate: 59,
      bestFormat: 'Reels',
      hasLink: true,
      activeHours: 'Terça e Quinta às 20:00'
    };
  }

  // 3. Lefer Automação Comercial
  if (cleanUser === 'leferautomacaocomercial' || cleanUser.includes('lefer') || cleanUser.includes('automacao')) {
    return {
      username: 'leferautomacaocomercial',
      fullName: 'Lefer Automação Comercial',
      followers: 850,
      following: 610,
      bio: '🖥️ Sistemas de Automação Comercial para o seu negócio\n🛒 Frente de caixa (PDV), impressoras, balanças e SAT\n📍 Atibaia e região\n👇 Solicite orçamento no WhatsApp',
      profilePic: '',
      externalUrl: 'https://wa.me/5511999999999',
      postCount: 65,
      averageLikes: 18,
      averageComments: 2,
      averageSaves: 1,
      averageShares: 0,
      engagementRate: 2.35,
      postsPerMonth: 3,
      followerGrowthRate: 0.1,
      reachRateNonFollowers: 15,
      reelsCompletionRate: 18,
      bestFormat: 'Carrossel',
      hasLink: true,
      activeHours: 'Segunda às 10:00'
    };
  }

  // 4. Instagram
  if (cleanUser === 'instagram') {
    return {
      username: 'instagram',
      fullName: 'Instagram',
      followers: 682000000,
      following: 81,
      bio: 'Bringing you closer to the people and things you love. 💛',
      profilePic: '',
      externalUrl: 'https://linkin.bio/instagram',
      postCount: 7500,
      averageLikes: 142000,
      averageComments: 8900,
      averageSaves: 24000,
      averageShares: 92000,
      engagementRate: 0.02,
      postsPerMonth: 15,
      followerGrowthRate: 0.05,
      reachRateNonFollowers: 45,
      reelsCompletionRate: 40,
      bestFormat: 'Reels',
      hasLink: true,
      activeHours: 'Todos os dias às 13:00'
    };
  }

  // 5. Fred
  if (cleanUser === 'fred') {
    return {
      username: 'fred',
      fullName: 'Fred Bruno',
      followers: 11200000,
      following: 1800,
      bio: 'Comunicador & Criador de Conteúdo ⚽🎙️\nContato: comercial@fredbruno.com.br\n👇 Assista ao meu último vídeo',
      profilePic: '',
      externalUrl: 'https://youtube.com/fredbruno',
      postCount: 3120,
      averageLikes: 124000,
      averageComments: 3100,
      averageSaves: 5600,
      averageShares: 34000,
      engagementRate: 1.13,
      postsPerMonth: 22,
      followerGrowthRate: 0.8,
      reachRateNonFollowers: 55,
      reelsCompletionRate: 48,
      bestFormat: 'Reels',
      hasLink: true,
      activeHours: 'Quarta e Domingo às 19:30'
    };
  }

  // 6. Nike
  if (cleanUser === 'nike') {
    return {
      username: 'nike',
      fullName: 'Nike',
      followers: 306000000,
      following: 140,
      bio: 'Bringing inspiration and innovation to every athlete* in the world.\n*If you have a body, you are an athlete.\n👇 Shop Nike',
      profilePic: '',
      externalUrl: 'https://nike.com',
      postCount: 1050,
      averageLikes: 420000,
      averageComments: 4100,
      averageSaves: 89000,
      averageShares: 215000,
      engagementRate: 0.14,
      postsPerMonth: 4,
      followerGrowthRate: 0.12,
      reachRateNonFollowers: 60,
      reelsCompletionRate: 52,
      bestFormat: 'Reels',
      hasLink: true,
      activeHours: 'Segunda às 12:00'
    };
  }

  // Allan Esfihas Atibaia
  if (cleanUser.includes('allan') && (cleanUser.includes('esfiha') || cleanUser.includes('cafe'))) {
    return {
      username: 'allanesfihas.atibaia',
      fullName: 'Allan Esfihas & Café',
      followers: 14200,
      following: 340,
      bio: '🍕 A melhor esfiha assada na hora em Atibaia!\n📍 Av. Copacabana, 412 - Jd. Cerejeiras\n👇 Faça seu pedido no WhatsApp',
      profilePic: '',
      externalUrl: 'https://wa.me/5511977842164',
      postCount: 184,
      averageLikes: 820,
      averageComments: 68,
      averageSaves: 94,
      averageShares: 112,
      engagementRate: 6.25,
      postsPerMonth: 12,
      followerGrowthRate: 1.85,
      reachRateNonFollowers: 52,
      reelsCompletionRate: 46,
      bestFormat: 'Reels',
      hasLink: true,
      activeHours: 'Terça e Quinta às 19:00'
    };
  }

  // Dra Nathalia Del Vecchio
  if (cleanUser.includes('nathalia') && (cleanUser.includes('vecchio') || cleanUser.includes('adv') || cleanUser.includes('dra'))) {
    return {
      username: 'dra.nathaliadelvecchio',
      fullName: 'Dra. Nathalia Del Vecchio',
      followers: 1540,
      following: 410,
      bio: '⚖️ Advocacia Trabalhista & Previdenciária\n💡 Direitos explicados de forma simples e direta\n📍 Atendimento em Atibaia/SP e Online\n👇 Agende uma consulta',
      profilePic: '',
      externalUrl: 'https://instagram.com/dra.nathaliadelvecchio/',
      postCount: 92,
      averageLikes: 68,
      averageComments: 8,
      averageSaves: 14,
      averageShares: 6,
      engagementRate: 4.93,
      postsPerMonth: 8,
      followerGrowthRate: 1.42,
      reachRateNonFollowers: 38,
      reelsCompletionRate: 38,
      bestFormat: 'Carrossel',
      hasLink: true,
      activeHours: 'Segunda e Quarta às 18:00'
    };
  }

  // Gerador determinístico baseado em hash
  let hash = 0;
  for (let i = 0; i < cleanUser.length; i++) {
    hash = cleanUser.charCodeAt(i) + ((hash << 5) - hash);
  }
  hash = Math.abs(hash);

  const sizeSelect = hash % 3;
  let followers = 1200 + (hash % 2400);
  if (sizeSelect === 1) followers = 4500 + (hash % 5000);
  if (sizeSelect === 2) followers = 12000 + (hash % 18000);

  const following = 200 + (hash % 600);
  const postCount = 45 + (hash % 200);
  const postsPerMonth = 3 + (hash % 11);
  
  let baseEng = 3.6 - (followers / 22000);
  if (baseEng < 0.6) baseEng = 0.6;
  const engagementRate = parseFloat((baseEng + ((hash % 140) / 100)).toFixed(2));

  const averageLikes = Math.round(followers * (engagementRate / 100) * 0.92) || 12;
  const averageComments = Math.round(averageLikes * 0.07) || 1;

  const saveRatio = 0.03 + ((hash % 11) / 100);
  const averageSaves = Math.round(averageLikes * saveRatio) || 1;
  
  const shareRatio = 0.02 + ((hash % 15) / 100);
  const averageShares = Math.round(averageLikes * shareRatio) || 1;

  const followerGrowthRate = parseFloat(((hash % 250) / 100 - 0.75).toFixed(2));
  const reachRateNonFollowers = 10 + (hash % 65);
  const reelsCompletionRate = 15 + (hash % 45);
  
  const formats = ['Reels', 'Carrossel', 'Humanização'];
  const bestFormat = formats[hash % 3];

  const hasLink = hash % 2 === 0;

  const days = ['Segunda e Quarta', 'Terça e Quinta', 'Quarta e Sexta', 'Segunda e Sexta'];
  const times = ['às 12:00', 'às 18:00', 'às 19:00', 'às 20:00'];
  const activeHours = `${days[hash % 4]} ${times[(hash >> 2) % 4]}`;

  let category = 'Empresa Local';
  if (cleanUser.includes('burger') || cleanUser.includes('pizza') || cleanUser.includes('doce') || cleanUser.includes('restaurante') || cleanUser.includes('comida') || cleanUser.includes('sushi')) {
    category = 'Gastronomia';
  } else if (cleanUser.includes('dr') || cleanUser.includes('dra') || cleanUser.includes('odonto') || cleanUser.includes('med') || cleanUser.includes('estet') || cleanUser.includes('clinic')) {
    category = 'Saúde/Profissional';
  } else if (cleanUser.includes('store') || cleanUser.includes('loja') || cleanUser.includes('mod') || cleanUser.includes('pet')) {
    category = 'Varejo/Comércio';
  }

  let bio = `Instagram da marca @${username}. Focado em atendimento local.`;
  if (category === 'Gastronomia') {
    bio = `🍔 Sabores incríveis todo dia!\n📍 Delivery em toda a região\n👇 Faça seu pedido no link abaixo`;
  } else if (category === 'Saúde/Profissional') {
    bio = `✨ Cuidando da sua saúde com dedicação\n📅 Agendamentos por direct ou telefone\n📍 Av. Central, 100`;
  } else if (category === 'Varejo/Comércio') {
    bio = `🛍️ As melhores tendências estão aqui\n📦 Enviamos para todo o Brasil\n💬 Dúvidas e compras via Direct!`;
  }

  return {
    username,
    fullName: username.charAt(0).toUpperCase() + username.slice(1).replace(/[\._]/g, ' '),
    followers,
    following,
    bio,
    profilePic: '',
    externalUrl: hasLink ? `https://wa.me/551199999${hash % 9999}` : '',
    postCount,
    averageLikes,
    averageComments,
    averageSaves,
    averageShares,
    engagementRate,
    postsPerMonth,
    followerGrowthRate,
    reachRateNonFollowers,
    reelsCompletionRate,
    bestFormat,
    hasLink,
    activeHours
  };
}

/**
 * CALCULO DE SCORE MATEMÁTICO - VERSÃO RIGIDA COMERCIAL
 */
function calculateMathematicalScore(profile) {
  let score = 10; // Start very low to be highly critical and commercial

  // 1. Fator de Audiência (Seguidores)
  // Poucos seguidores (< 1500) limitam drasticamente o alcance inicial do algoritmo.
  if (profile.followers >= 10000) score += 15;
  else if (profile.followers >= 1500) score += 8;
  else score += 2; // Penalidade para contas pequenas

  // 2. Fator de Engajamento Real (relativo à base)
  // Para contas pequenas, o engajamento DEVE ser alto. Se for baixo, é crítico.
  const eng = profile.engagementRate;
  if (profile.followers < 1500) {
    if (eng >= 5.0) score += 20;
    else if (eng >= 3.0) score += 12;
    else if (eng >= 1.5) score += 5;
    else score += 1;
  } else {
    if (eng >= 3.5) score += 20;
    else if (eng >= 2.0) score += 12;
    else if (eng >= 1.0) score += 5;
    else score += 1;
  }

  // 3. Frequência de Postagem (Consistência é rei para o algoritmo)
  const posts = profile.postsPerMonth;
  if (posts >= 12) score += 15;
  else if (posts >= 8) score += 10;
  else if (posts >= 4) score += 4;
  else score += 0;

  // 4. Retenção & Compartilhamentos (Sends/Saves - o coração do algoritmo)
  // Proporção de salvamentos por curtidas e taxa de retenção estimada do Reels
  const saveRatio = profile.averageSaves / (profile.averageLikes || 1);
  const completion = profile.reelsCompletionRate || 0;
  
  if (saveRatio >= 0.10 && completion >= 45) score += 20;
  else if (saveRatio >= 0.06 || completion >= 30) score += 10;
  else score += 2;

  if (profile.hasLink) score += 15;
  else score += 0;

  return Math.min(Math.max(score, 25), 92);
}

/**
 * AUDITOR ESTRUTURADO DE FALLBACK - VERSÃO RIGIDA COMERCIAL
 */
function generateStructuralFallbackAudit(profile) {
  const isNoLink = !profile.hasLink;
  const isLowFreq = profile.postsPerMonth < 10;
  const isLowEng = profile.engagementRate < 2.5;
  const isConfusingBio = profile.bio.length < 30 || !profile.bio.includes('\n');

  const cleanUser = profile.username.toLowerCase();
  const cleanBio = profile.bio.toLowerCase();
  let niche = 'Negócios Locais';
  let suggestionBio = 'reescreva sua biografia focando no seu diferencial de serviço local.';
  let reelsIdea = 'grave um Reels de 15 segundos mostrando a entrega ou o dia a dia do seu negócio.';
  
  if (cleanUser.includes('burger') || cleanUser.includes('pizza') || cleanUser.includes('doce') || cleanUser.includes('restaurante') || cleanUser.includes('comida') || cleanUser.includes('sushi') || cleanBio.includes('sabor') || cleanBio.includes('delivery')) {
    niche = 'Gastronomia';
    suggestionBio = 'coloque em destaque o seu diferencial de sabor, horário de funcionamento/delivery e uma chamada para ver o cardápio.';
    reelsIdea = 'grave em close-up o processo de montagem do seu prato mais vendido hoje (ex: o queijo derretendo) e use um áudio em alta de 7 segundos.';
  } else if (cleanUser.includes('dr') || cleanUser.includes('dra') || cleanUser.includes('odonto') || cleanUser.includes('med') || cleanUser.includes('estet') || cleanUser.includes('clinic') || cleanBio.includes('consulta') || cleanBio.includes('saúde') || cleanBio.includes('estética')) {
    niche = 'Saúde/Estética';
    suggestionBio = 'coloque o seu registro profissional (CRM/CRO), sua especialidade de forma clara e uma frase geradora de autoridade.';
    reelsIdea = 'grave você mesma respondendo à principal dúvida de consultório que seus clientes trazem toda semana, em até 20 segundos.';
  } else if (cleanUser.includes('store') || cleanUser.includes('loja') || cleanUser.includes('mod') || cleanUser.includes('pet') || cleanBio.includes('enviamos') || cleanBio.includes('loja')) {
    niche = 'Varejo/Moda';
    suggestionBio = 'deixe claro as formas de entrega (ex: "Enviamos para todo o BR") e como comprar direto pelo catálogo ou WhatsApp.';
    reelsIdea = 'mostre um provador dinâmico ou os detalhes das peças chegando em estoque, com transições rápidas sincronizadas com a batida da música.';
  }

  let bio_feedback = '';
  if (isNoLink) {
    bio_feedback = `Achei essa dor: O perfil @${profile.username} está operando como uma loja de portas fechadas para o algoritmo. Sem um link estratégico na bio, os clientes em potencial entram, mas não sabem onde clicar para comprar ou agendar, resultando em uma perda silenciosa de até 80% das suas vendas do Instagram. Se eu pudesse te dar um conselho de amigo, perfis de ${niche} precisam de um link de WhatsApp imediato e rastreável. Para fazer isso de graça agora, use o gerador de links Convertte para criar um link do seu WhatsApp com uma mensagem de boas-vindas personalizada e coloque no seu perfil hoje mesmo. Agora, se você quer ir além e estruturar um funil de conversão profissional com landing pages e campanhas avançadas, entre em contato com a Krad agência.`;
  } else {
    bio_feedback = `Achei essa dor: Embora você tenha o link (${profile.externalUrl}) ativo, o posicionamento da biografia do perfil @${profile.username} está muito institucional e genérico, não gerando conexão imediata em 3 segundos. Se eu pudesse te dar um conselho de amigo, perfis de ${niche} precisam de uma promessa forte. Para corrigir isso de graça, reescreva sua Bio em 3 linhas focando no seu diferencial: 1) ${suggestionBio}, 2) Uma prova social ou elemento de confiança, e 3) Um convite direto apontando para o link. Se quiser um design de posicionamento premium desenhado por estrategistas para atrair clientes qualificados, fale com a Krad agência.`;
  }

  let content_feedback = '';
  if (isLowEng) {
    content_feedback = `Achei essa dor: Seu engajamento de ${profile.engagementRate}% está abaixo do benchmark ideal do algoritmo (2.5%). Suas postagens parecem panfletos digitais frios e não estimulam retenção nem envios por DM, que são os maiores pesos do algoritmo atual. Se eu pudesse te dar um conselho de amigo, contas no nicho de ${niche} precisam de reels magnéticos. Para resolver isso de graça hoje mesmo: ${reelsIdea} Isso aumentará drasticamente o tempo de retenção do perfil. Se você quer parar de quebrar a cabeça gravando e quer que nossa agência cuide de todos os roteiros, captação presencial e edição premium de vídeos, entre em contato com a Krad agência.`;
  } else {
    content_feedback = `Achei essa dor: Embora o público goste do seu conteúdo (engajamento de ${profile.engagementRate}%), postar apenas ${profile.postsPerMonth} vezes por mês faz o algoritmo esquecer que você existe e derrubar a entrega de novos leads locais. Se eu pudesse te dar um conselho de amigo, perfis de ${niche} precisam de consistência para aquecer o funil. Para resolver isso de graça hoje: estruture um cronograma de 3 postagens por semana intercalando Reels informativos e Carrosséis, agendando tudo pelo Meta Business Suite. Se não tem tempo de gerenciar isso e quer leads chegando todo dia de forma automática via anúncios de tráfego local, fale com a Krad agência.`;
  }

  let tips = [];
  if (profile.bestFormat === 'Reels') {
    tips = [
      `Crie 3 Reels de bastidores de até 20 segundos focando no público de ${niche}, com ganchos fortes nos primeiros 3 segundos.`,
      'Estimule salvamentos na legenda (ex: "Salve este post para consultar quando precisar!"), pois salvamentos são o que mais faz o algoritmo entregar seu post.',
      'Evite artes prontas de Canva ou banco de imagens no feed; prefira fotos reais suas ou da sua equipe trabalhando, o que humaniza a marca.'
    ];
  } else if (profile.bestFormat === 'Carrossel') {
    tips = [
      `Crie um Carrossel educativo resolvendo a maior dor do seu cliente local de ${niche}. A última página deve ter uma chamada direta para clicar no seu link.`,
      'Melhore o título (gancho) da primeira página para forçar o usuário a arrastar para o lado, o que aumenta o tempo de retenção do perfil.',
      'Faça uma sequência de Stories diários com enquetes e caixas de perguntas para forçar a interação direta da sua audiência.'
    ];
  } else {
    tips = [
      `Grave sequências de Stories explicando um benefício específico para clientes de ${niche} e abra caixas de perguntas para gerar conversas no direct.`,
      'Fixe 3 posts estratégicos no topo do seu perfil: 1 de apresentação ("Quem somos"), 1 depoimento de cliente (prova social) e 1 mostrando seu produto principal.',
      'Configure respostas automáticas rápidas no direct para que qualquer interessado que mande mensagem receba atendimento em menos de 1 minuto.'
    ];
  }

  return {
    score: profile.score,
    bio_feedback,
    content_feedback,
    tips,
    triggers: {
      noLink: isNoLink,
      lowFrequency: isLowFreq,
      lowEngagement: isLowEng,
      confusingBio: isConfusingBio
    }
  };
}
