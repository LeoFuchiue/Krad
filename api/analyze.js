/**
 * KRAD Agência — Instagram Profile Analyzer API
 * Vercel Serverless Function (Node.js)
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
    
    let profileData = null;
    let isRealData = false;

    if (apiKey) {
      try {
        const response = await fetch(`https://${apiHost}/v1/info?username_or_id_or_url=${encodeURIComponent(username)}`, {
          method: 'GET',
          headers: {
            'X-RapidAPI-Key': apiKey,
            'X-RapidAPI-Host': apiHost
          }
        });

        if (response.ok) {
          const raw = await response.json();
          const data = raw.data || raw;
          
          profileData = {
            username: data.username || username,
            fullName: data.full_name || data.fullName || username,
            followers: data.follower_count || data.followers || 0,
            following: data.following_count || data.following || 0,
            bio: data.biography || data.bio || '',
            profilePic: data.profile_pic_url || data.profilePic || '',
            externalUrl: data.external_url || data.externalUrl || '',
            postCount: data.media_count || data.postCount || 0,
          };

          let averageLikes = 0;
          let averageComments = 0;
          let recentPosts = data.feed?.items || data.recent_posts || [];

          if (recentPosts.length > 0) {
            let totalLikes = 0;
            let totalComments = 0;
            const count = Math.min(recentPosts.length, 12);

            for (let i = 0; i < count; i++) {
              const post = recentPosts[i];
              totalLikes += post.like_count || post.likes || 0;
              totalComments += post.comment_count || post.comments || 0;
            }

            averageLikes = Math.round(totalLikes / count);
            averageComments = Math.round(totalComments / count);
          } else {
            averageLikes = Math.round(profileData.followers * 0.024);
            averageComments = Math.round(averageLikes * 0.08);
          }

          const engagementRate = profileData.followers > 0 
            ? parseFloat((((averageLikes + averageComments) / profileData.followers) * 100).toFixed(2))
            : 0;

          profileData.averageLikes = averageLikes;
          profileData.averageComments = averageComments;
          profileData.engagementRate = engagementRate;
          profileData.postsPerMonth = Math.min(Math.round(profileData.postCount / 12) || 8, 15);
          isRealData = true;
        }
      } catch (err) {
        console.error('Erro ao buscar dados na RapidAPI:', err.message);
      }
    }

    if (!profileData) {
      profileData = getMockData(username);
      isRealData = false;
    }

    const geminiKey = process.env.GEMINI_API_KEY;
    let audit = null;

    if (geminiKey) {
      try {
        const prompt = `Você é o Diretor de Criação e Estrategista da "krad agência", uma agência premium de posicionamento, tráfego pago e produção visual para negócios locais.
Faça uma análise crítica, premium e realista do perfil do Instagram abaixo. Escreva em Português do Brasil.

PERFIL DETALHADO:
- Username: @${profileData.username}
- Nome Comercial: ${profileData.fullName}
- Seguidores: ${profileData.followers.toLocaleString('pt-BR')}
- Taxa de Engajamento Real: ${profileData.engagementRate}% (Média do mercado local é de 2.0% a 3.5%)
- Média de Curtidas/Vídeo: ${profileData.averageLikes.toLocaleString('pt-BR')}
- Frequência de Postagem: ~${profileData.postsPerMonth} posts por mês
- Link na Bio: ${profileData.externalUrl || 'Nenhum link configurado'}
- Biografia do Perfil: "${profileData.bio}"

REGRAS DE RETORNO DO JSON:
1. "score": Dê uma nota de 0 a 100 baseada na combinação de engajamento, consistência visual, copy da bio e presença de link de conversão.
2. "bio_feedback": Analise se a bio tem um posicionamento profissional claro que converte visitas em clientes locais ou se é genérica e amadora. Seja direto e sincero.
3. "content_feedback": Analise a taxa de engajamento de ${profileData.engagementRate}% e a frequência. Recomende a produção de Reels humanizados de bastidores se o engajamento estiver baixo ou mediano.
4. "tips": Uma lista com exatamente 3 conselhos práticos e específicos para esse tipo de perfil local crescer em faturamento e relevância.

ATENÇÃO: Mantenha um tom profissional, direto ao ponto, honesto e motivador, mostrando que a KRAD pode executar esse trabalho completo (captação profissional, edição e tráfego pago local).`;

        const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${geminiKey}`;
        const geminiResponse = await fetch(geminiUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
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
                  }
                },
                required: ["score", "bio_feedback", "content_feedback", "tips"]
              }
            }
          })
        });

        if (geminiResponse.ok) {
          const geminiRaw = await geminiResponse.json();
          const contentText = geminiRaw.candidates[0].content.parts[0].text;
          audit = JSON.parse(contentText);
        } else {
          console.error('Erro na resposta do Gemini API:', geminiResponse.statusText);
        }
      } catch (err) {
        console.error('Erro ao chamar o Gemini API:', err.message);
      }
    }

    if (!audit) {
      audit = generateFallbackAudit(profileData);
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

function getMockData(username) {
  const cleanUser = username.toLowerCase().trim();

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
      engagementRate: 6.25,
      postsPerMonth: 12
    };
  }

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
      engagementRate: 4.93,
      postsPerMonth: 8
    };
  }

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
  
  let baseEng = 3.8 - (followers / 20000);
  if (baseEng < 0.6) baseEng = 0.6;
  const engagementRate = parseFloat((baseEng + ((hash % 150) / 100)).toFixed(2));

  const averageLikes = Math.round(followers * (engagementRate / 100) * 0.92);
  const averageComments = Math.round(averageLikes * 0.08) || 1;

  let category = 'Empresa Local';
  if (cleanUser.includes('burger') || cleanUser.includes('pizza') || cleanUser.includes('doce') || cleanUser.includes('restaurante') || cleanUser.includes('comida') || cleanUser.includes('sushi')) {
    category = 'Gastronomia';
  } else if (cleanUser.includes('dr') || cleanUser.includes('dra') || cleanUser.includes('odonto') || cleanUser.includes('med') || cleanUser.includes('estet') || cleanUser.includes('clinic')) {
    category = 'Saúde/Profissional';
  } else if (cleanUser.includes('store') || cleanUser.includes('loja') || cleanUser.includes('mod') || cleanUser.includes('pet')) {
    category = 'Varejo/Comércio';
  }

  let bio = `Perfil comercial da marca @${username} no Instagram.`;
  if (category === 'Gastronomia') {
    bio = `🍔 Sabores únicos e ingredientes de qualidade!\n📍 Atendimento de Terça a Domingo\n🛵 Delivery rápido pelo link na bio.`;
  } else if (category === 'Saúde/Profissional') {
    bio = `✨ Especialista em realçar sua melhor versão\n📅 Agendamentos de consultas via Direct\n📍 Atendimento presencial com hora marcada.`;
  } else if (category === 'Varejo/Comércio') {
    bio = `🛍️ Novidades toda semana com envio para todo o Brasil\n👇 Compre pelo WhatsApp no link abaixo\n💬 Dúvidas no Direct.`;
  }

  return {
    username,
    fullName: username.charAt(0).toUpperCase() + username.slice(1).replace(/[\._]/g, ' '),
    followers,
    following,
    bio,
    profilePic: '',
    externalUrl: hash % 2 === 0 ? `https://wa.me/551199999${hash % 9999}` : '',
    postCount,
    averageLikes,
    averageComments,
    engagementRate,
    postsPerMonth
  };
}

function generateFallbackAudit(profile) {
  const eng = profile.engagementRate;
  const freq = profile.postsPerMonth;
  const followers = profile.followers;
  
  let score = 50;
  
  if (eng > 5.0) score += 35;
  else if (eng > 3.0) score += 28;
  else if (eng > 1.8) score += 18;
  else score += 8;

  if (freq >= 10) score += 25;
  else if (freq >= 6) score += 18;
  else if (freq >= 3) score += 10;
  else score += 3;

  if (profile.externalUrl) score += 20;
  else score += 5;

  if (followers > 5000) score += 20;
  else if (followers > 1500) score += 15;
  else score += 10;

  score = Math.min(Math.max(score, 15), 98);

  let bio_feedback = '';
  let content_feedback = '';
  let tips = [];

  if (profile.externalUrl) {
    bio_feedback = `A presença de um link externo (${profile.externalUrl}) é excelente e facilita a conversão. No entanto, a copy da biografia do perfil @${profile.username} pode ser estruturada com uma Proposta Única de Valor mais forte para prender a atenção do público local imediatamente nos primeiros 3 segundos.`;
  } else {
    bio_feedback = `⚠️ ALERTA CRÍTICO: O perfil @${profile.username} não possui um link de conversão ativo na bio. Isso representa uma perda de até 80% das vendas que poderiam ser geradas de forma orgânica pelo Instagram. É essencial configurar um link direto de WhatsApp com mensagem personalizada imediatamente.`;
  }

  if (eng < 2.0) {
    content_feedback = `O engajamento atual de ${eng}% está ABAIXO da média de mercado (2.5% a 3.5%). Isso indica que as postagens atuais podem estar muito focadas em panfletagem digital estática (fotos frias ou banco de imagens). A frequência de ${freq} posts/mês é razoável, mas o algoritmo está limitando a entrega.`;
    tips = [
      'Substitua artes institucionais estáticas por Reels de bastidores e processos reais do seu negócio gravados com celular, que retêm a atenção até 5× mais.',
      'Insira chamadas para ação claras (CTAs) em todas as legendas, estimulando salvamentos e comentários (ex: "Salve este post para consultar quando precisar!").',
      'Ative campanhas locais de tráfego pago para direcionar os seus melhores Reels na tela das pessoas que moram ou trabalham a até 5km do seu negócio.'
    ];
  } else if (eng < 4.0) {
    content_feedback = `O engajamento de ${eng}% está DENTRO da média esperada. Indica que existe interesse no que você publica. Contudo, para se destacar da concorrência na região e converter seguidores em vendas frequentes, é necessário estruturar melhor a produção de Reels de entretenimento e bastidores.`;
    tips = [
      'Grave vídeos de processos mostrando os bastidores do atendimento, montagem de pratos ou entrega de produtos. Isso gera identificação imediata.',
      'Organize enquetes frequentes nos Stories (como "Qual seu preferido?") para manter seus seguidores engajados e melhorar a entrega orgânica geral.',
      'Invista em anúncios segmentados na região de Atibaia focando em geolocalização e públicos interessados em seu nicho de mercado.'
    ];
  } else {
    content_feedback = `Parabéns! O engajamento de ${eng}% está ACIMA da média de mercado, demonstrando forte conexão emocional com os seguidores atuais. Com ${freq} posts ao mês, a consistência é boa. O próximo passo é escalar esse alcance localmente com anúncios patrocinados para atrair clientes de novos bairros.`;
    tips = [
      'Aproveite a ótima conexão com o público para criar depoimentos ou fotos de clientes reais utilizando seu serviço/produto para gerar prova social.',
      'Use o tráfego pago local para impulsionar os posts orgânicos que já performaram melhor, multiplicando o alcance para novos moradores da cidade.',
      'Crie um Reels curto de apresentação do seu espaço físico e fixe no topo do seu feed para que novos visitantes saibam exatamente onde você fica e o que faz.'
    ];
  }

  return {
    score,
    bio_feedback,
    content_feedback,
    tips
  };
}
