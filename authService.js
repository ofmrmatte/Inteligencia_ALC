(function () {
  function getClient() {
    if (!window.supabaseClient) {
      throw new Error("Configuração do Supabase não encontrada.");
    }
    return window.supabaseClient;
  }

  window.authService = {
    async login(email, password) {
      const { data, error } = await getClient().auth.signInWithPassword({
        email,
        password,
      });

      if (error) throw error;
      return data;
    },

    async registerUser({ email, password, name }) {
      const { data, error } = await getClient().auth.signUp({
        email,
        password,
        options: {
          data: {
            name: name || "Usuário",
          },
        },
      });

      if (error) throw error;
      return data;
    },

    async logout() {
      const { error } = await getClient().auth.signOut();
      if (error) throw error;
    },

    async getSession() {
      const { data, error } = await getClient().auth.getSession();
      if (error) throw error;
      return data.session;
    },

    async getCurrentUser() {
      const {
        data: { user },
        error,
      } = await getClient().auth.getUser();

      if (error) throw error;
      return user;
    },

    async getCurrentProfile() {
      const user = await this.getCurrentUser();

      if (!user) {
        return null;
      }

      const { data: profile, error } = await getClient()
        .from("profiles")
        .select("*")
        .eq("id", user.id)
        .single();

      if (error) throw error;

      return {
        user,
        profile,
        isAdmin: profile?.is_admin === true,
      };
    },

    async getUsers() {
      const { data, error } = await getClient()
        .from("profiles")
        .select("*")
        .order("created_at", { ascending: true });

      if (error) throw error;
      return data;
    },

    async updateProfile(userId, updates) {
      const { data, error } = await getClient()
        .from("profiles")
        .update({
          ...updates,
          updated_at: new Date().toISOString(),
        })
        .eq("id", userId)
        .select()
        .single();

      if (error) throw error;
      return data;
    },

    async updateUserAdmin(userId, isAdmin) {
      const { data, error } = await getClient()
        .from("profiles")
        .update({
          is_admin: isAdmin,
          role: isAdmin ? "admin" : "user",
          updated_at: new Date().toISOString(),
        })
        .eq("id", userId)
        .select()
        .single();

      if (error) throw error;
      return data;
    },

    async updatePassword(newPassword) {
      const { data, error } = await getClient().auth.updateUser({
        password: newPassword,
      });

      if (error) throw error;
      return data;
    },
  };
})();
