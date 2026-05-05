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

      let { data: profile, error } = await getClient()
        .from("profiles")
        .select("*")
        .eq("id", user.id)
        .maybeSingle();

      if (error) throw error;

      if (!profile) {
        const { data: createdProfile, error: createError } = await getClient()
          .from("profiles")
          .insert({
            id: user.id,
            email: user.email,
            name: user.user_metadata?.name || "Usuário",
            role: "user",
            is_admin: false,
            setor: "LOSS",
          })
          .select()
          .single();

        if (createError) throw createError;
        profile = createdProfile;
      }

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

    async updateUserSetor(userId, setor) {
      const { data, error } = await getClient()
        .from("profiles")
        .update({
          setor,
          updated_at: new Date().toISOString(),
        })
        .eq("id", userId)
        .select()
        .single();

      if (error) throw error;
      return data;
    },

    async updateUserProfileFields(userId, updates) {
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

    async updatePassword(newPassword) {
      const { data, error } = await getClient().auth.updateUser({
        password: newPassword,
      });

      if (error) throw error;
      return data;
    },
  };
})();
