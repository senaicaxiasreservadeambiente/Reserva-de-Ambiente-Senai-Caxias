// ============================================================================
// CONFIGURAÇÃO SEGURA DO SUPABASE
// ============================================================================

const SUPABASE_URL = 'https://kpvearnxbnrazhkiyqeo.supabase.co';
const SUPABASE_KEY = 'sb_publishable_LGW8XoafLGgLQxnRYiXRdg_a3chpGZW';

const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

// ESTADO GLOBAL
let usuarioLogado = null;
let perfilUsuario = null;
let listaAmbientes = [];
let listaReservas = [];

// INICIALIZAÇÃO DA APLICAÇÃO
document.addEventListener("DOMContentLoaded", async () => {
  const hoje = new Date().toISOString().split("T")[0];
  const filtroData = document.getElementById("filtro-data-reserva");
  if (filtroData) filtroData.value = hoje;

  const { data: { session } } = await supabaseClient.auth.getSession();
  if (session) {
    usuarioLogado = session.user;
    await carregarPerfilEIniciar();
  } else {
    exibirTelaAuth();
  }
});

// ALTERNA TELA DE AUTH
function toggleAuth(modo) {
  const formLogin = document.getElementById("form-login");
  const formCadastro = document.getElementById("form-cadastro");
  if (modo === "cadastro") {
    formLogin.classList.add("hidden");
    formCadastro.classList.remove("hidden");
  } else {
    formCadastro.classList.add("hidden");
    formLogin.classList.remove("hidden");
  }
}

// CADASTRO DE FUNCIONÁRIO
async function handleCadastro(e) {
  e.preventDefault();
  const nome = document.getElementById("cad-nome").value.trim();
  const email = document.getElementById("cad-email").value.trim();
  const matricula = document.getElementById("cad-matricula").value.trim();
  const segmento = document.getElementById("cad-segmento").value;
  const cargo = document.getElementById("cad-cargo").value;
  const senha = document.getElementById("cad-senha").value;

  const { data, error } = await supabaseClient.auth.signUp({ email, password: senha });

  if (error) {
    alert("Erro no cadastro: " + error.message);
    return;
  }

  if (data.user) {
    const { error: perfilError } = await supabaseClient.from("perfis").insert([
      { id: data.user.id, nome, email, matricula, segmento, cargo }
    ]);

    if (perfilError) {
      alert("Erro ao salvar perfil: " + perfilError.message);
      return;
    }

    alert(`Funcionário cadastrado com sucesso como ${cargo.toUpperCase()}! Faça login.`);
    toggleAuth("login");
  }
}

// LOGIN
async function handleLogin(e) {
  e.preventDefault();
  const email = document.getElementById("login-email").value.trim();
  const senha = document.getElementById("login-senha").value;

  const { data, error } = await supabaseClient.auth.signInWithPassword({ email, password: senha });

  if (error) {
    alert("Erro ao acessar: Credenciais inválidas.");
    return;
  }
  usuarioLogado = data.user;
  await carregarPerfilEIniciar();
}

// CARREGA PERFIL E AJUSTA INTERFACE DE ACORDO COM O CARGO
async function carregarPerfilEIniciar() {
  const { data, error } = await supabaseClient
    .from("perfis")
    .select("*")
    .eq("id", usuarioLogado.id)
    .single();

  if (data) {
    perfilUsuario = data;
  } else {
    perfilUsuario = { nome: usuarioLogado.email, cargo: "Instrutor", segmento: "TI" };
  }

  document.getElementById("auth-container").classList.add("hidden");
  document.getElementById("app-container").classList.remove("hidden");

  document.getElementById("user-display").innerText = `Olá, ${perfilUsuario.nome}`;
  const badge = document.getElementById("badge-perfil");
  badge.innerText = perfilUsuario.cargo;

  // AJUSTAR VISIBILIDADE DAS ABAS COM BASE NAS PERMISSÕES DO CARGO
  const cargo = perfilUsuario.cargo;
  const eTecnicoOuCoord = (cargo === "Tecnico de Educacao" || cargo === "Coordenador");

  if (cargo === "Instrutor" || eTecnicoOuCoord) {
    document.getElementById("btn-tab-solicitar").classList.remove("hidden");
  }

  if (eTecnicoOuCoord) {
    document.getElementById("btn-tab-validar").classList.remove("hidden");
    document.getElementById("btn-tab-ambientes").classList.remove("hidden");
    document.getElementById("btn-tab-funcionarios").classList.remove("hidden");
  }

  await carregarAmbientes();
  await carregarReservas();
}

// LOGOUT
async function handleLogout() {
  await supabaseClient.auth.signOut();
  window.location.reload();
}

function exibirTelaAuth() {
  document.getElementById("auth-container").classList.remove("hidden");
  document.getElementById("app-container").classList.add("hidden");
}

// ALTERNÂNCIA DE ABAS
function trocarAba(aba) {
  document.querySelectorAll(".tab-content").forEach(el => el.classList.add("hidden"));
  document.querySelectorAll(".nav-btn").forEach(el => el.classList.remove("active"));

  if (window.event && window.event.target) window.event.target.classList.add("active");

  if (aba === "reservas") {
    document.getElementById("aba-reservas").classList.remove("hidden");
    carregarReservas();
  } else if (aba === "solicitar") {
    document.getElementById("aba-solicitar").classList.remove("hidden");
  } else if (aba === "validar") {
    document.getElementById("aba-validar").classList.remove("hidden");
    carregarSolicitacoesPendentes();
  } else if (aba === "ambientes") {
    document.getElementById("aba-ambientes").classList.remove("hidden");
    carregarTabelaAmbientes();
  } else if (aba === "funcionarios") {
    document.getElementById("aba-funcionarios").classList.remove("hidden");
    carregarTabelaFuncionarios();
  }
}

/* =========================================================
   MÓDULO DE AMBIENTES (LISTAGEM E SELEÇÃO)
   ========================================================= */
async function carregarAmbientes() {
  const { data, error } = await supabaseClient.from("ambientes").select("*").order("nome");
  if (error) return;

  listaAmbientes = data || [];
  
  // Preencher dropdown da Solicitação de Reserva
  const selectAmb = document.getElementById("res-ambiente");
  if (selectAmb) {
    selectAmb.innerHTML = '<option value="">Selecione um ambiente...</option>';
    listaAmbientes.forEach(a => {
      const opt = document.createElement("option");
      opt.value = a.id;
      opt.innerText = `${a.nome} (${a.segmento} - Cap: ${a.capacidade} lugares)`;
      selectAmb.appendChild(opt);
    });
  }
}

/* =========================================================
   MÓDULO DE RESERVAS (CONSULTA, SOLICITAÇÃO E VALIDAÇÃO)
   ========================================================= */
async function carregarReservas() {
  const segmento = document.getElementById("filtro-segmento").value;
  const dataFiltro = document.getElementById("filtro-data-reserva").value;

  let query = supabaseClient.from("reservas").select("*");

  if (segmento !== "todos") {
    query = query.or(`segmento_ambiente.eq.${segmento},segmento_instrutor.eq.${segmento}`);
  }

  if (dataFiltro) {
    query = query.lte("data_inicio", dataFiltro).gte("data_fim", dataFiltro);
  }

  const { data, error } = await query.order("criado_em", { ascending: false });
  const tabelaCorpo = document.getElementById("tabela-reservas-corpo");
  tabelaCorpo.innerHTML = "";

  if (error || !data || data.length === 0) {
    tabelaCorpo.innerHTML = '<tr><td colspan="6" class="text-center">Nenhuma reserva encontrada para os filtros selecionados.</td></tr>';
    return;
  }

  data.forEach(r => {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td><strong>${r.codigo_reserva}</strong></td>
      <td>${r.nome_ambiente} <br><small class="hint">${r.segmento_ambiente}</small></td>
      <td>${formatarData(r.data_inicio)} até ${formatarData(r.data_fim)}</td>
      <td>${r.turno} <br><small class="hint">${r.horario}</small></td>
      <td>${r.nome_instrutor} <br><small class="hint">${r.segmento_instrutor}</small></td>
      <td><span class="badge-status ${r.status}">${r.status}</span></td>
    `;
    tabelaCorpo.appendChild(tr);
  });
}

// SOLICITAR RESERVA (INSTRUTORES E TÉCNICOS)
async function solicitarReserva(e) {
  e.preventDefault();
  const ambienteId = document.getElementById("res-ambiente").value;
  const turno = document.getElementById("res-turno").value;
  const dataInicio = document.getElementById("res-data-inicio").value;
  const dataFim = document.getElementById("res-data-fim").value;
  const horario = document.getElementById("res-horario").value.trim();
  const obs = document.getElementById("res-obs").value.trim();

  const ambienteObj = listaAmbientes.find(a => a.id === ambienteId);
  if (!ambienteObj) {
    alert("Selecione um ambiente válido!");
    return;
  }

  const btn = document.getElementById("btn-enviar-reserva");
  btn.disabled = true;
  btn.innerText = "Enviando...";

  const codigo = `RES-${Math.floor(1000 + Math.random() * 9000)}`;

  const novaReserva = {
    codigo_reserva: codigo,
    data_inicio: dataInicio,
    data_fim: dataFim,
    turno: turno,
    horario: horario,
    instrutor_id: usuarioLogado.id,
    nome_instrutor: perfilUsuario.nome,
    segmento_instrutor: perfilUsuario.segmento,
    ambiente_id: ambienteObj.id,
    nome_ambiente: ambienteObj.nome,
    segmento_ambiente: ambienteObj.segmento,
    status: (perfilUsuario.cargo === "Tecnico de Educacao" || perfilUsuario.cargo === "Coordenador") ? "Aprovada" : "Pendente",
    observacoes: obs
  };

  const { error } = await supabaseClient.from("reservas").insert([novaReserva]);

  btn.disabled = false;
  btn.innerText = "Enviar Solicitação";

  if (error) {
    alert("Erro ao solicitar reserva: " + error.message);
  } else {
    alert(`Solicitação realizada com sucesso! Código: ${codigo}`);
    document.getElementById("form-solicitar-reserva").reset();
    trocarAba("reservas");
  }
}

// CARREGAR SOLICITAÇÕES PENDENTES PARA ADMINISTRAÇÃO
async function carregarSolicitacoesPendentes() {
  const { data, error } = await supabaseClient
    .from("reservas")
    .select("*")
    .order("criado_em", { ascending: false });

  const tabelaCorpo = document.getElementById("tabela-validacao-corpo");
  tabelaCorpo.innerHTML = "";

  if (error || !data || data.length === 0) {
    tabelaCorpo.innerHTML = '<tr><td colspan="6" class="text-center">Nenhuma solicitação encontrada.</td></tr>';
    return;
  }

  data.forEach(r => {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td><strong>${r.codigo_reserva}</strong></td>
      <td>${r.nome_instrutor} (${r.segmento_instrutor})</td>
      <td>${r.nome_ambiente}</td>
      <td>${formatarData(r.data_inicio)} - ${r.turno}</td>
      <td><span class="badge-status ${r.status}">${r.status}</span></td>
      <td class="text-center">
        <button class="btn btn-sm btn-success" onclick="alterarStatusReserva('${r.id}', 'Aprovada')">✔️ Aprovar</button>
        <button class="btn btn-sm btn-danger" onclick="alterarStatusReserva('${r.id}', 'Recusada')">❌ Recusar</button>
      </td>
    `;
    tabelaCorpo.appendChild(tr);
  });
}

async function alterarStatusReserva(id, novoStatus) {
  const { error } = await supabaseClient
    .from("reservas")
    .update({ status: novoStatus })
    .eq("id", id);

  if (error) {
    alert("Erro ao atualizar status: " + error.message);
  } else {
    carregarSolicitacoesPendentes();
  }
}

/* =========================================================
   CRUD DE AMBIENTES (TÉCNICOS E COORDENADORES)
   ========================================================= */
function carregarTabelaAmbientes() {
  const tabelaCorpo = document.getElementById("tabela-ambientes-corpo");
  tabelaCorpo.innerHTML = "";

  listaAmbientes.forEach(a => {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td><strong>${a.nome}</strong></td>
      <td>${a.tipo}</td>
      <td>${a.segmento}</td>
      <td>${a.capacidade} lugares</td>
      <td class="text-center">
        <button class="btn btn-sm btn-edit" onclick="prepararEdicaoAmbiente('${a.id}')">✏️ Editar</button>
        <button class="btn btn-sm btn-danger" onclick="excluirAmbiente('${a.id}')">🗑️ Excluir</button>
      </td>
    `;
    tabelaCorpo.appendChild(tr);
  });
}

async function salvarAmbiente(e) {
  e.preventDefault();
  const id = document.getElementById("amb-id").value;
  const nome = document.getElementById("amb-nome").value.trim();
  const tipo = document.getElementById("amb-tipo").value;
  const segmento = document.getElementById("amb-segmento").value;
  const capacidade = parseInt(document.getElementById("amb-capacidade").value);

  if (id) {
    await supabaseClient.from("ambientes").update({ nome, tipo, segmento, capacidade }).eq("id", id);
  } else {
    await supabaseClient.from("ambientes").insert([{ nome, tipo, segmento, capacidade }]);
  }

  limparFormAmbiente();
  await carregarAmbientes();
  carregarTabelaAmbientes();
}

function prepararEdicaoAmbiente(id) {
  const a = listaAmbientes.find(item => item.id === id);
  if (!a) return;

  document.getElementById("amb-id").value = a.id;
  document.getElementById("amb-nome").value = a.nome;
  document.getElementById("amb-tipo").value = a.tipo;
  document.getElementById("amb-segmento").value = a.segmento;
  document.getElementById("amb-capacidade").value = a.capacidade;

  document.getElementById("titulo-form-ambiente").innerText = "✏️ Editar Ambiente";
  document.getElementById("btn-cancelar-ambiente").classList.remove("hidden");
}

function limparFormAmbiente() {
  document.getElementById("form-ambiente").reset();
  document.getElementById("amb-id").value = "";
  document.getElementById("titulo-form-ambiente").innerText = "🏫 Cadastrar / Editar Ambiente";
  document.getElementById("btn-cancelar-ambiente").classList.add("hidden");
}

async function excluirAmbiente(id) {
  if (confirm("Tem certeza que deseja excluir este ambiente?")) {
    await supabaseClient.from("ambientes").delete().eq("id", id);
    await carregarAmbientes();
    carregarTabelaAmbientes();
  }
}

/* =========================================================
   CRUD DE FUNCIONÁRIOS (TÉCNICOS E COORDENADORES)
   ========================================================= */
async function carregarTabelaFuncionarios() {
  const { data, error } = await supabaseClient.from("perfis").select("*").order("nome");
  const tabelaCorpo = document.getElementById("tabela-funcionarios-corpo");
  tabelaCorpo.innerHTML = "";

  if (error || !data) return;

  data.forEach(f => {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td><strong>${f.nome}</strong></td>
      <td>${f.email}</td>
      <td>${f.matricula}</td>
      <td>${f.segmento}</td>
      <td><span class="badge">${f.cargo}</span></td>
      <td class="text-center">
        <button class="btn btn-sm btn-danger" onclick="excluirFuncionario('${f.id}')">🗑️ Excluir</button>
      </td>
    `;
    tabelaCorpo.appendChild(tr);
  });
}

async function excluirFuncionario(id) {
  if (confirm("Deseja remover este funcionário?")) {
    await supabaseClient.from("perfis").delete().eq("id", id);
    carregarTabelaFuncionarios();
  }
}

function formatarData(dataISO) {
  if (!dataISO) return "";
  const [ano, mes, dia] = dataISO.split("-");
  return `${dia}/${mes}/${ano}`;
}

/* =========================================================
   BLOQUEIO DE INSPEÇÃO E BOTÃO DIREITO (DESATIVADO PARA TESTES)
   ========================================================= */

document.addEventListener("contextmenu", (e) => e.preventDefault());

document.addEventListener("keydown", (e) => {
  if (e.keyCode === 123 || e.key === "F12") e.preventDefault();
  if (e.ctrlKey && e.shiftKey && (e.keyCode === 73 || e.keyCode === 74 || e.keyCode === 67 || e.key === 'I' || e.key === 'J' || e.key === 'C')) e.preventDefault();
  if (e.ctrlKey && (e.keyCode === 85 || e.keyCode === 83 || e.key === 'u' || e.key === 's')) e.preventDefault();
});

setInterval(() => {
  const antes = performance.now();
  debugger;
  const depois = performance.now();
  if (depois - antes > 100) window.location.reload();
}, 1000);
