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

  // KRAD Agência (Perfil do Usuário)
  if (cleanUser.includes('krad') || cleanUser.includes('leofuchiue')) {
    return {
      username: username,
      fullName: 'krad agência',
      followers: 1250,
      following: 320,
      bio: '🚀 Posicionamento & Tráfego Pago para Negócios Locais\n📸 Captação Premium (Gravações no local)\n👇 Conheça nossa agência',
      profilePic: '',
      externalUrl: 'https://krad.com.br',
      postCount: 42,
      averageLikes: 124,
      averageComments: 18,
      averageSaves: 16,
      averageShares: 22,
      engagementRate: 11.36,
      postsPerMonth: 12,
      followerGrowthRate: 2.1,
      reachRateNonFollowers: 68,
      reelsCompletionRate: 54,
      bestFormat: 'Reels',
      hasLink: true,
      activeHours: 'Segunda e Quinta às 18:30'
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
  const postsPerMonth = 3 + (hash % 11); // 3 a 13 posts por mês
  
  // Engajamento simulado
  let baseEng = 3.6 - (followers / 22000);
  if (baseEng < 0.6) baseEng = 0.6;
  const engagementRate = parseFloat((baseEng + ((hash % 140) / 100)).toFixed(2));

  const averageLikes = Math.round(followers * (engagementRate / 100) * 0.92) || 12;
  const averageComments = Math.round(averageLikes * 0.07) || 1;

  // Métricas profundas
  // Proporção de salvamentos (meta 10%) - alguns perfis salvam mais, outros menos
  const saveRatio = 0.03 + ((hash % 11) / 100); // 3% a 14%
  const averageSaves = Math.round(averageLikes * saveRatio) || 1;
  
  const shareRatio = 0.02 + ((hash % 15) / 100); // 2% a 17%
  const averageShares = Math.round(averageLikes * shareRatio) || 1;

  const followerGrowthRate = parseFloat(((hash % 250) / 100 - 0.75).toFixed(2)); // -0.75% a +1.75%
  const reachRateNonFollowers = 10 + (hash % 65); // 10% a 75%
  const reelsCompletionRate = 15 + (hash % 45); // 15% a 60%
  
  const formats = ['Reels', 'Carrossel', 'Humanização'];
  const bestFormat = formats[hash % 3];

  const hasLink = hash % 2 === 0;

  // Dias e horários ativos
  const days = ['Segunda e Quarta', 'Terça e Quinta', 'Quarta e Sexta', 'Segunda e Sexta'];
  const times = ['às 12:00', 'às 18:00', 'às 19:00', 'às 20:00'];
  const activeHours = `${days[hash % 4]} ${times[(hash >> 2) % 4]}`;

  // Bio
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
  let score = 15; // Régua bem mais rígida (base de 15 em vez de 50)

  // 1. Engajamento (máx 25)
  if (profile.engagementRate > 6.0) score += 25;
  else if (profile.engagementRate > 3.5) score += 18;
  else if (profile.engagementRate > 2.0) score += 10;
  else score += 2;

  // 2. Frequência (máx 20)
  if (profile.postsPerMonth >= 12) score += 20;
  else if (profile.postsPerMonth >= 8) score += 12;
  else if (profile.postsPerMonth >= 5) score += 6;
  else score += 1;

  // 3. Link na bio (máx 20)
  if (profile.hasLink) score += 20;
  else score += 0; // punição severa se não tiver link

  // 4. Retenção de Reels / Saves (máx 20)
  const saveRatio = profile.averageSaves / profile.averageLikes;
  if (saveRatio > 0.11 && profile.reelsCompletionRate > 45) score += 20;
  else if (saveRatio > 0.07 || profile.reelsCompletionRate > 30) score += 10;
  else score += 3;

  // 5. Crescimento (máx 10)
  if (profile.followerGrowthRate > 1.8) score += 10;
  else if (profile.followerGrowthRate > 0.8) score += 6;
  else if (profile.followerGrowthRate >= 0.2) score += 3;
  else score += 0;

  // Garante que o score final fique entre 25 e 98
  return Math.min(Math.max(score, 25), 98);
}

/**
 * AUDITOR ESTRUTURADO DE FALLBACK - VERSÃO RIGIDA COMERCIAL
 */
function generateStructuralFallbackAudit(profile) {
  const isNoLink = !profile.hasLink;
  const isLowFreq = profile.postsPerMonth < 10;
  const isLowEng = profile.engagementRate < 2.5;
  const isConfusingBio = profile.bio.length < 30 || !profile.bio.includes('\n');

  let bio_feedback = '';
  if (isNoLink) {
    bio_feedback = `Achei essa dor: O seu perfil @${profile.username} está operando como uma loja de portas fechadas, pois não possui nenhum link ativo na bio. Isso representa uma perda silenciosa de até 80% das vendas potenciais vindas do Instagram. Para resolver isso hoje mesmo de graça, crie um link direto para o seu WhatsApp no site Convertte (ou similar) e insira no seu perfil. E se você quiser explorar um funil profissional de verdade, com uma Landing Page de alta conversão e campanhas locais de tráfego, entre em contato com a Krad agência para decolarmos o seu negócio.`;
  } else {
    bio_feedback = `Achei essa dor: Embora você tenha o link (${profile.externalUrl}) ativo, o posicionamento da sua biografia está fraco e não deixa claro em 3 segundos o valor do seu negócio. Para resolver isso hoje de graça, reescreva sua Bio em 3 linhas: 1) Qual a transformação do seu produto, 2) Uma prova de autoridade (ex: "+500 clientes atendidos"), e 3) Uma chamada de ação apontando para o link (ex: "Clique abaixo 👇"). Se quiser um posicionamento de marca premium projetado por especialistas para atrair clientes de alto padrão, entre em contato com a Krad agência.`;
  }

  let content_feedback = '';
  if (isLowEng) {
    content_feedback = `Achei essa dor: Seu engajamento de ${profile.engagementRate}% está crítico (abaixo do benchmark ideal de 2.5%). Isso mostra que seus posts são "panfletos frios" e não geram conexão. Para resolver isso hoje de graça, evite artes prontas de Canva e grave um Reels dinâmico de bastidores de 15 segundos com seu celular, usando um gancho forte na tela e chamando a audiência para comentar. Agora, se você quer terceirizar o trabalho duro de roteiro, captação presencial de fotos/vídeos e anúncios de tráfego local, entre em contato com a Krad agência.`;
  } else {
    content_feedback = `Achei essa dor: Embora seu engajamento de ${profile.engagementRate}% seja saudável, postar apenas ${profile.postsPerMonth} vezes por mês faz seu perfil ficar invisível para o algoritmo. Para resolver isso de graça, monte um cronograma simples de 3 postagens semanais intercalando Reels e Carrosséis, agendando-os pelo Meta Business Suite. Se você não tem tempo para gerenciar isso e quer profissionais cuidando do seu calendário editorial e gerando leads diários, fale com a Krad agência.`;
  }

  let tips = [];
  if (profile.bestFormat === 'Reels') {
    tips = [
      'Crie 3 Reels de bastidores de até 20 segundos nesta semana mostrando o processo real do seu negócio com ganchos fortes nos primeiros 3 segundos.',
      'Estimule salvamentos na legenda (ex: "Salve este post para consultar quando precisar!"), pois salvamentos são o que mais faz o algoritmo entregar seu post.',
      'Evite artes prontas de Canva ou banco de imagens no feed; prefira fotos reais suas ou da sua equipe trabalhando, o que humaniza a marca.'
    ];
  } else if (profile.bestFormat === 'Carrossel') {
    tips = [
      'Crie um Carrossel educativo de 5 páginas resolvendo a maior dor do seu cliente local. A última página deve ter uma chamada direta para clicar no seu link.',
      'Melhore o título (gancho) da primeira página para forçar o usuário a arrastar para o lado, o que aumenta o tempo de retenção do perfil.',
      'Faça uma sequência de 5 Stories diários com enquetes e caixas de perguntas para forçar a interação direta da sua audiência.'
    ];
  } else {
    tips = [
      'Apareça nos Stories! Grave 2 sequências semanais explicando um benefício do seu produto ou serviço e abra caixas de perguntas para gerar conversas no direct.',
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


