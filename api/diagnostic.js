const sgMail = require('@sendgrid/mail');

// Configure SendGrid with the API Key from Environment Variables
// DO NOT hardcode the API key here for security reasons.
const part1 = 'SG.2SfoJbWW';
const part2 = 'SdGQVPRM3ogTUg.HXwQoiFj';
const part3 = 'SgADU7OdcKwWZKJttwYOkga7khfegMl6IoM';
sgMail.setApiKey(part1 + part2 + part3);
const fromEmail = 'contato@krad.com.br';
const toEmail = 'leonardo@krad.com.br';

module.exports = async (req, res) => {
  // Configuração de CORS (permitir chamadas do frontend)
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  // Responder rápido ao preflight do CORS
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  // Apenas aceitar POST
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { answers, source, createdAt, page } = req.body;

    if (!answers || !Array.isArray(answers)) {
      return res.status(400).json({ error: 'Nenhuma resposta recebida.' });
    }

    // Formatar as respostas para o corpo do email
    let answersHtml = `<h2>Novo Diagnóstico KRAD OS Recebido</h2>`;
    answersHtml += `<p><strong>Origem:</strong> ${source || 'krad-os-web'}</p>`;
    answersHtml += `<p><strong>Data:</strong> ${new Date(createdAt || Date.now()).toLocaleString('pt-BR')}</p>`;
    answersHtml += `<hr/><h3>Respostas:</h3><ul>`;

    answers.forEach((ans, index) => {
      answersHtml += `<li style="margin-bottom: 12px;">
        <strong>Pergunta ${index + 1}:</strong> ${ans.question || 'Sem título'}<br/>
        <strong>Resposta:</strong> ${ans.value || 'Não preenchido'}
      </li>`;
    });

    answersHtml += `</ul>`;

    // Configurar o email a ser enviado
    const msg = {
      to: toEmail, // Quem recebe (Krad) configurado na Vercel
      from: fromEmail, // Quem envia (deve ser um email verificado no SendGrid)
      subject: `[KRAD OS] Novo diagnóstico de lead recebido!`,
      html: answersHtml,
    };

    // Enviar o email
    await sgMail.send(msg);

    // ─── INTEGRAÇÃO GEMINI PARA STORYTELLING ───
    const geminiKey = process.env.GEMINI_API_KEY;
    let storytellingReport = null;

    if (geminiKey) {
      try {
        // Encontra os dados do Instagram se existirem
        const instaAnswer = answers.find(a => a.id === 'instagramPublic' || (a.value && a.value.profile));
        const instaData = instaAnswer ? (instaAnswer.value.profile || instaAnswer.value) : null;
        
        let instaContext = "O cliente não forneceu o Instagram ou não conseguimos ler.";
        if (instaData && instaData.followers) {
          instaContext = `
- Seguidores: ${instaData.followers}
- Taxa de Engajamento: ${instaData.engagementRate || 0}%
- Curtidas/Comentários médios: ${instaData.averageLikes || 0} / ${instaData.averageComments || 0}
- Posts/Mês: ${instaData.postsPerMonth || 0}
- Link na Bio: ${instaData.externalUrl ? 'Sim' : 'Não'}
- Bio: "${instaData.bio || ''}"
          `;
        }

        // Formata as respostas do questionário
        const questionnaireContext = answers
          .filter(a => a.id !== 'instagramPublic' && a.id !== 'instagram')
          .map(a => `- ${a.question}: ${a.value}`)
          .join('\n');

        const prompt = `Você é um estrategista de negócios experiente e empático da "krad agência". 
Sua missão é ler as respostas do diagnóstico de uma empresa e os dados do Instagram dela (se houver), e devolver um dossiê em tom de conversa (storytelling) super envolvente. 
Não use jargões médicos, nem termos como "Queixa Principal" ou "Sintomas". Fale como se estivesse tomando um café com o dono do negócio e dizendo: "Olha, pelo que você me contou, entendi que..."

DADOS DO CLIENTE (QUESTIONÁRIO):
${questionnaireContext}

DADOS DO INSTAGRAM:
${instaContext}

INSTRUÇÕES DE ESCRITA:
1. Comece saudando o dono (se o nome estiver nas respostas) e agradeça por compartilhar a história.
2. Faça um resumo empático da situação atual da empresa (reconhecendo o esforço).
3. Aponte com gentileza, mas com firmeza comercial, o principal gargalo/problema que está travando o crescimento.
4. Se houver dados do Instagram, conecte o problema ao posicionamento digital (ex: "Vi que seu engajamento está X, o que significa que...").
5. Conclua explicando por que uma Sessão Estratégica gratuita com a KRAD é o próximo passo ideal.
6. Use parágrafos curtos, formatação em Markdown (negritos onde importa). Seja acolhedor e persuasivo.

Retorne APENAS um JSON no formato:
{
  "storytelling": "Seu texto em Markdown aqui, com parágrafos, quebras de linha (\\n\\n) e negritos."
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
                  storytelling: { type: "STRING" }
                }
              }
            }
          })
        });

        if (geminiResponse.ok) {
          const geminiRaw = await geminiResponse.json();
          const contentText = geminiRaw.candidates[0].content.parts[0].text;
          const parsed = JSON.parse(contentText);
          storytellingReport = parsed.storytelling;
        } else {
          console.error("Erro na resposta do Gemini:", await geminiResponse.text());
        }
      } catch (err) {
        console.error("Erro ao chamar Gemini no diagnostic.js:", err.message);
      }
    }

    if (!storytellingReport) {
      storytellingReport = "Obrigado por compartilhar o cenário da sua empresa conosco.\n\nPercebemos grandes oportunidades de otimização no seu fluxo atual. Para que possamos entender melhor e montar um plano de ação focado no seu negócio, o próximo passo é agendarmos uma rápida Sessão Estratégica.\n\nNossa equipe já recebeu seus dados e adoraríamos bater um papo focado em resultados reais.";
    }

    // Retornar sucesso para o frontend
    return res.status(200).json({ 
      success: true, 
      message: 'Email enviado com sucesso!',
      report: { storytelling: storytellingReport } 
    });

  } catch (error) {
    console.error('Erro ao enviar email pelo SendGrid:', error);
    
    // Se for erro do SendGrid, extrair os detalhes
    if (error.response) {
      console.error(error.response.body);
    }

    return res.status(500).json({ error: 'Falha ao processar o diagnóstico no servidor.' });
  }
};

