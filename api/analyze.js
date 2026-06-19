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
        if (apiHost.includes('instagram120')) {
          response = await fetch(`https://${apiHost}/api/instagram/profile`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'X-RapidAPI-Key': apiKey,
              'X-RapidAPI-Host': apiHost
            },
            body: JSON.stringify({ username: username })
          });
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
          
          // Suporte para instagram120 que envolve em raw.result
          const data = raw.result || raw.data || raw;
          
          const followers = data.edge_followed_by?.count || data.follower_count || data.followers || 0;
          const following = data.edge_follow?.count || data.following_count || data.following || 0;
          const bio = data.biography || data.bio || '';
          const externalUrl = data.external_url || data.externalUrl || '';
          const postCount = data.edge_owner_to_timeline_media?.count || data.media_count || data.postCount || 0;
          
          profileData = {
            username: data.username || username,
            fullName: data.full_name || data.fullName || username,
            followers: followers,
            following: following,
            bio: bio,
            profilePic: data.profile_pic_url_hd || data.profile_pic_url || data.profilePic || '',
            externalUrl: externalUrl,
            postCount: postCount,
          };

          // Calcular engajamento e métricas a partir dos posts
          let averageLikes = 0;
          let averageComments = 0;
          let recentPosts = data.feed?.items || data.recent_posts || data.edge_owner_to_timeline_media?.edges || [];

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
        const prompt = `Você é o Diretor de Criação da "krad agência", especialista em posicionamento e tráfego local.
Faça uma análise crítica, premium, sincera e realista do perfil do Instagram @${profileData.username}. 
Não use termos genéricos. Você DEVE citar os números específicos do perfil na sua análise.

DADOS REAIS DO PERFIL:
- Nome: ${profileData.fullName}
- Seguidores: ${profileData.followers.toLocaleString('pt-BR')}
- Taxa de Engajamento: ${profileData.engagementRate}% (Benchmark local: 2.0% a 3.5%)
- Frequência de Posts: ${profileData.postsPerMonth} posts nos últimos 30 dias (Benchmark saudável: 8 a 12 posts)
- Curtidas Médias: ${profileData.averageLikes} | Comentários Médios: ${profileData.averageComments}
- Proporção de Salvamentos: ${profileData.averageSaves} salvamentos médios por post (Meta: 10% das curtidas, ou seja, ${Math.round(profileData.averageLikes * 0.1)})
- Compartilhamentos Médios: ${profileData.averageShares}
- Crescimento de Seguidores: ${profileData.followerGrowthRate}% ao mês (Benchmark: 1% a 2%)
- Distribuição de Alcance (Não-Seguidores): ${profileData.reachRateNonFollowers}% (Benchmark Reels: 40% a 50%)
- Retenção do Reels (primeiros 3 segundos): ${profileData.reelsCompletionRate}% (Benchmark: >35%)
- Melhor Formato da Conta: ${profileData.bestFormat}
- Link na Bio: ${profileData.hasLink ? profileData.externalUrl : 'NÃO POSSUI LINK NA BIO'}
- Texto da Bio: "${profileData.bio}"

REGRAS DE RETORNO DO JSON:
Retorne estritamente um objeto JSON com o seguinte formato, sem marcações markdown de código e sem textos adicionais:
{
  "score": ${profileData.score},
  "bio_feedback": "sua análise crítica detalhada e sincera da biografia e posicionamento atual (responda se a promessa é fraca, se o link é inexistente ou ineficiente)",
  "content_feedback": "sua análise crítica detalhada e sincera da taxa de engajamento, frequência de posts, salvamentos, e retenção de reels",
  "tips": [
    "Dica prática e imediata 1 baseada no formato ideal do perfil (${profileData.bestFormat})",
    "Dica prática e imediata 2 baseada no engajamento (${profileData.engagementRate}%) ou na proporção de salvamentos (${profileData.averageSaves})",
    "Dica prática e imediata 3 baseada na presença de link ou no crescimento de seguidores (${profileData.followerGrowthRate}%)"
  ],
  "triggers": {
    "noLink": ${!profileData.hasLink},
    "lowFrequency": ${profileData.postsPerMonth < 8},
    "lowEngagement": ${profileData.engagementRate < 1.5},
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
 * CALCULO DE SCORE MATEMÁTICO
 */
function calculateMathematicalScore(profile) {
  let score = 50;

  // 1. Engajamento (máx 30)
  if (profile.engagementRate > 5.0) score += 30;
  else if (profile.engagementRate > 3.0) score += 24;
  else if (profile.engagementRate > 1.8) score += 15;
  else score += 5;

  // 2. Frequência (máx 20)
  if (profile.postsPerMonth >= 10) score += 20;
  else if (profile.postsPerMonth >= 7) score += 15;
  else if (profile.postsPerMonth >= 4) score += 8;
  else score += 2;

  // 3. Link na bio (máx 20)
  if (profile.hasLink) score += 20;
  else score += 0; // punição severa se não tiver link

  // 4. Retenção de Reels / Saves (máx 20)
  const saveRatio = profile.averageSaves / profile.averageLikes;
  if (saveRatio > 0.09 && profile.reelsCompletionRate > 35) score += 20;
  else if (saveRatio > 0.05 || profile.reelsCompletionRate > 25) score += 12;
  else score += 5;

  // 5. Crescimento (máx 10)
  if (profile.followerGrowthRate > 1.2) score += 10;
  else if (profile.followerGrowthRate > 0.2) score += 7;
  else if (profile.followerGrowthRate >= 0) score += 4;
  else score += 0;

  return Math.min(Math.max(score, 12), 98);
}

/**
 * AUDITOR ESTRUTURADO DE FALLBACK
 */
function generateStructuralFallbackAudit(profile) {
  const isNoLink = !profile.hasLink;
  const isLowFreq = profile.postsPerMonth < 8;
  const isLowEng = profile.engagementRate < 1.5;
  const isConfusingBio = profile.bio.length < 30 || !profile.bio.includes('\n');

  let bio_feedback = '';
  if (isNoLink) {
    bio_feedback = `⚠️ ALERTA CRÍTICO: O perfil @${profile.username} não possui um link de conversão ativo na bio. Isso representa uma perda de até 80% das vendas que poderiam ser geradas de forma orgânica pelo Instagram. É essencial configurar um link direto de WhatsApp com mensagem personalizada imediatamente.`;
  } else {
    bio_feedback = `A presença de um link externo (${profile.externalUrl}) é excelente e facilita a conversão. No entanto, a copy da biografia do perfil @${profile.username} pode ser estruturada com uma Proposta Única de Valor mais forte para prender a atenção do público local imediatamente nos primeiros 3 segundos.`;
  }

  let content_feedback = '';
  if (isLowEng) {
    content_feedback = `O engajamento atual de ${profile.engagementRate}% está ABAIXO da média de mercado (2.5% a 3.5%). Isso indica que as postagens atuais podem estar muito focadas em panfletagem digital estática (fotos frias ou banco de imagens). A frequência de ${profile.postsPerMonth} posts/mês é razoável, mas o algoritmo está limitando a entrega.`;
  } else {
    content_feedback = `O engajamento de ${profile.engagementRate}% está DENTRO da média esperada. Indica que existe interesse no que você publica. Contudo, para se destacar da concorrência na região e converter seguidores em vendas frequentes, é necessário estruturar melhor a produção de Reels de entretenimento e bastidores.`;
  }

  let tips = [];
  if (profile.bestFormat === 'Reels') {
    tips = [
      'Substitua artes institucionais estáticas por Reels de bastidores e processos reais do seu negócio gravados com celular, que retêm a atenção até 5× mais.',
      'Insira chamadas para ação claras (CTAs) em todas as legendas, estimulando salvamentos e comentários (ex: "Salve este post para consultar quando precisar!").',
      'Ative campanhas locais de tráfego pago para direcionar os seus melhores Reels na tela das pessoas que moram ou trabalham a até 5km do seu negócio.'
    ];
  } else if (profile.bestFormat === 'Carrossel') {
    tips = [
      'Crie carrosséis de conteúdo educativo ou passo-a-passo resolvendo uma dor do cliente. A última página do carrossel deve ter um CTA direcionando para o WhatsApp.',
      'Melhore o gancho visual da primeira página do carrossel para forçar o usuário a arrastar para o lado, aumentando o tempo de retenção.',
      'Utilize legendas com técnicas de copywriting detalhando os pontos mostrados no carrossel, aumentando a taxa de salvamentos.'
    ];
  } else {
    tips = [
      'Apareça mais! Poste fotos reais trabalhando, conte a história de como você começou a empresa ou mostre o depoimento de um cliente satisfeito com uma foto sua ao lado.',
      'Use os Stories diariamente com enquetes e caixas de perguntas para interagir diretamente com a sua base e gerar conexão humana.',
      'Fixe 3 publicações estratégicas no topo do feed: um post de apresentação do negócio, um depoimento de cliente (prova social) e o seu principal produto/serviço.'
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
